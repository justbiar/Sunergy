// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ISunergyFarmRegistry} from "../interfaces/ISunergyFarmRegistry.sol";
import {ISunergyRewards} from "../interfaces/ISunergyRewards.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @title SunergyRewards
/// @notice Issues SNR tokens and Carbon Credits based on oracle-verified kWh.
///
/// TOKENOMICS:
///   - Base reward: SNR_PER_KWH SNR tokens per verified kWh
///   - Carbon credit: 1 tonne CO₂e per CARBON_KWH_RATE kWh verified
///   - Halving: reward rate halves every HALVING_INTERVAL epochs
///
/// MONAD PARALLELISM:
///   - Energy accrual (recordVerifiedEnergy) is keyed by (farmId, epoch) →
///     zero cross-farm contention.
///   - Reward claiming (claimRewards) is keyed by farmId → parallelizable
///     across all farms in the same block.
///   - No shared global accumulator is ever written in the hot path.
///
/// ACCRUAL vs CLAIM SEPARATION:
///   recordVerifiedEnergy  → accrues rewards into per-farm pending balance
///   claimRewards          → operator withdraws accrued rewards (pull pattern)
contract SunergyRewards is ISunergyRewards, AccessControl, ReentrancyGuard, Pausable {
    // =========================================================================
    // Roles
    // =========================================================================
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // =========================================================================
    // Tokenomics constants
    // =========================================================================

    /// @notice SNR reward per kWh (in SNR units, 18 decimals).
    ///         Default: 10 SNR per kWh.
    uint256 public snrPerKwh;

    /// @notice kWh required to earn 1 Carbon Credit (ERC-1155 token, 0 decimals).
    ///         Default: 1000 kWh = 1 tonne CO₂e (rough average).
    uint256 public carbonKwhRate;

    /// @notice Epochs between each halving of snrPerKwh.
    uint256 public immutable HALVING_INTERVAL;

    /// @notice Epoch at which the protocol started (for halving calculation).
    uint256 public immutable GENESIS_EPOCH;

    // =========================================================================
    // External contracts
    // =========================================================================
    ISunergyFarmRegistry public immutable registry;
    IMintable            public immutable snrToken;
    IMintable            public immutable carbonCredit;

    // =========================================================================
    // State — all keyed by farmId for Monad parallel-safety
    // =========================================================================

    struct EpochRecord {
        uint256 verifiedKwh;
        bool    processed;
    }

    // Epoch-level records (written by oracle, read by claim)
    // MONAD: different farms → different slots → full parallelism
    mapping(bytes32 farmId => mapping(uint256 epoch => EpochRecord)) private _epochRecords;

    // Per-farm pending rewards (written incrementally, drained on claim)
    mapping(bytes32 farmId => uint256) public pendingSnr;
    mapping(bytes32 farmId => uint256) public pendingCarbonKwh; // accumulated kWh toward next credit

    // Lifetime stats (useful for frontend / analytics)
    mapping(bytes32 farmId => uint256) public lifetimeKwh;
    mapping(bytes32 farmId => uint256) public lifetimeSnrMinted;
    mapping(bytes32 farmId => uint256) public lifetimeCarbonMinted;

    // Protocol-wide totals (acceptable contention: only updated on finalization, not every oracle tick)
    uint256 public totalVerifiedKwh;
    uint256 public totalSnrMinted;

    // =========================================================================
    // Events
    // =========================================================================
    event EnergyRecorded(bytes32 indexed farmId, uint256 indexed epoch, uint256 kwh);
    event RewardsClaimed(bytes32 indexed farmId, address indexed operator, uint256 snrAmount, uint256 carbonCredits);
    event HalvingOccurred(uint256 epoch, uint256 newRatePerKwh);
    event SnrRateUpdated(uint256 newRate);
    event CarbonRateUpdated(uint256 newRate);

    // =========================================================================
    // Errors
    // =========================================================================
    error NotOracle();
    error AlreadyProcessed(bytes32 farmId, uint256 epoch);
    error FarmNotActive(bytes32 farmId);
    error NothingToClaim(bytes32 farmId);
    error ZeroKwh();

    // =========================================================================
    // Constructor
    // =========================================================================
    constructor(
        address admin,
        address oracleAddr,
        address registryAddr,
        address snrTokenAddr,
        address carbonCreditAddr,
        uint256 initialSnrPerKwh,   // e.g., 10 ether  (= 10 SNR per kWh)
        uint256 initialCarbonRate,  // e.g., 1000       (kWh per tonne)
        uint256 halvingInterval,    // e.g., 8760       (epochs per year at 1h epochs)
        uint256 genesisEpoch
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracleAddr);
        _grantRole(PAUSER_ROLE, admin);

        registry     = ISunergyFarmRegistry(registryAddr);
        snrToken     = IMintable(snrTokenAddr);
        carbonCredit = IMintable(carbonCreditAddr);

        snrPerKwh       = initialSnrPerKwh;
        carbonKwhRate   = initialCarbonRate;
        HALVING_INTERVAL = halvingInterval;
        GENESIS_EPOCH    = genesisEpoch;
    }

    // =========================================================================
    // Oracle entrypoint (called by SunergyOracle after finalization)
    // =========================================================================

    /// @notice Record oracle-verified energy for a farm epoch.
    ///         Accrues pending SNR and carbon kWh — does NOT mint yet (pull pattern).
    /// @param  farmId       Farm identifier
    /// @param  epoch        Epoch being finalized
    /// @param  verifiedKwh  Trimmed-median kWh from SunergyOracle
    function recordVerifiedEnergy(bytes32 farmId, uint256 epoch, uint256 verifiedKwh)
        external
        override
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        if (verifiedKwh == 0) revert ZeroKwh();
        if (!registry.isFarmActive(farmId)) revert FarmNotActive(farmId);

        EpochRecord storage rec = _epochRecords[farmId][epoch];
        if (rec.processed) revert AlreadyProcessed(farmId, epoch);

        rec.verifiedKwh = verifiedKwh;
        rec.processed   = true;

        // Compute effective SNR rate (apply halving)
        uint256 effectiveRate = _effectiveSnrRate(epoch);

        // Accrue rewards — no minting here, operator must call claimRewards
        uint256 snrAccrued = verifiedKwh * effectiveRate / 1e3;  // kwh is ×1e3 fixed-point
        pendingSnr[farmId] += snrAccrued;

        // Accrue carbon kWh — normalise from mWh×1e3 to real kWh (÷1e3)
        // so that carbonKwhRate can be expressed in human-readable kWh units.
        uint256 realKwh = verifiedKwh / 1e3;
        pendingCarbonKwh[farmId] += realKwh;

        // Update lifetime stats (stored in real kWh)
        unchecked {
            lifetimeKwh[farmId]     += realKwh;
            totalVerifiedKwh        += realKwh;
        }

        emit EnergyRecorded(farmId, epoch, verifiedKwh);
    }

    // =========================================================================
    // Operator: claim accrued rewards (pull pattern)
    // =========================================================================

    /// @notice Operator claims all pending SNR + Carbon Credits for their farm.
    ///         Fully parallelizable across farms on Monad (each farmId = isolated slots).
    function claimRewards(bytes32 farmId) external nonReentrant whenNotPaused {
        if (!registry.isFarmActive(farmId)) revert FarmNotActive(farmId);

        address operator = registry.getFarmOperator(farmId);
        if (msg.sender != operator) revert NotOracle(); // reuse error; only operator can claim

        uint256 snrAmount = pendingSnr[farmId];
        uint256 kwhAccum  = pendingCarbonKwh[farmId];
        uint256 credits   = kwhAccum / carbonKwhRate;

        if (snrAmount == 0 && credits == 0) revert NothingToClaim(farmId);

        // Drain pending balances before minting (CEI)
        pendingSnr[farmId]       = 0;
        pendingCarbonKwh[farmId] = kwhAccum % carbonKwhRate; // keep remainder

        // Mint SNR
        if (snrAmount > 0) {
            snrToken.mint(operator, snrAmount);
            unchecked {
                lifetimeSnrMinted[farmId] += snrAmount;
                totalSnrMinted            += snrAmount;
            }
        }

        // Mint Carbon Credits (ERC-1155 tokenId 0 = current vintage)
        if (credits > 0) {
            carbonCredit.mint(operator, credits);
            unchecked { lifetimeCarbonMinted[farmId] += credits; }
        }

        emit RewardsClaimed(farmId, operator, snrAmount, credits);
    }

    // =========================================================================
    // Halving logic
    // =========================================================================

    /// @notice Effective SNR rate at a given epoch, accounting for halvings.
    function _effectiveSnrRate(uint256 epoch) internal view returns (uint256) {
        if (HALVING_INTERVAL == 0) return snrPerKwh;
        uint256 halvings = (epoch - GENESIS_EPOCH) / HALVING_INTERVAL;
        // Cap halvings at 64 to prevent underflow (rate would be effectively 0 anyway)
        if (halvings >= 64) return 0;
        return snrPerKwh >> halvings;
    }

    /// @notice Public view of effective rate at current epoch.
    function effectiveSnrRate(uint256 epoch) external view returns (uint256) {
        return _effectiveSnrRate(epoch);
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function setSnrPerKwh(uint256 rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        snrPerKwh = rate;
        emit SnrRateUpdated(rate);
    }

    function setCarbonKwhRate(uint256 rate) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rate > 0, "rate > 0");
        carbonKwhRate = rate;
        emit CarbonRateUpdated(rate);
    }

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // =========================================================================
    // Views
    // =========================================================================

    function getEpochRecord(bytes32 farmId, uint256 epoch)
        external
        view
        returns (EpochRecord memory)
    {
        return _epochRecords[farmId][epoch];
    }

    function pendingRewards(bytes32 farmId)
        external
        view
        returns (uint256 snrAmount, uint256 carbonCredits)
    {
        snrAmount     = pendingSnr[farmId];
        carbonCredits = pendingCarbonKwh[farmId] / carbonKwhRate;
    }
}
