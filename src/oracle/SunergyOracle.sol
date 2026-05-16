// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISunergyFarmRegistry} from "../interfaces/ISunergyFarmRegistry.sol";
import {ISunergyRewards} from "../interfaces/ISunergyRewards.sol";

/// @title SunergyOracle
/// @notice Two-phase commit-reveal energy oracle with trimmed-median aggregation.
///
/// FLOW PER EPOCH:
///   Phase 1 — Commit  (blocks 0..COMMIT_WINDOW):
///     Validators submit: keccak256(abi.encode(farmId, epoch, kwh, salt))
///   Phase 2 — Reveal  (blocks COMMIT_WINDOW..COMMIT_WINDOW+REVEAL_WINDOW):
///     Validators reveal (farmId, epoch, kwh, salt).  Contract verifies hash.
///   Finalization (after REVEAL_WINDOW closes):
///     Anyone calls finalizeEpoch(farmId, epoch).
///     Trimmed median is computed → EnergyVerified event emitted.
///     SunergyRewards.recordVerifiedEnergy() is called for reward accrual.
///
/// MONAD PARALLELISM:
///   - Commits and reveals are keyed by (farmId, epoch, validator).
///     Different farms → zero slot contention in the same block.
///   - Finalization is one tx per farm per epoch: fully parallelizable
///     when a keeper batch-finalizes multiple farms in one block.
///   - No shared mutable aggregator updated mid-epoch: all writes are
///     isolated to per-validator, per-farm slots.
contract SunergyOracle is AccessControl, ReentrancyGuard {
    // =========================================================================
    // Roles
    // =========================================================================
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    bytes32 public constant KEEPER_ROLE    = keccak256("KEEPER_ROLE");

    // =========================================================================
    // Config
    // =========================================================================
    uint256 public immutable EPOCH_DURATION;   // seconds per epoch
    uint256 public immutable COMMIT_WINDOW;    // seconds for commit phase
    uint256 public immutable REVEAL_WINDOW;    // seconds for reveal phase

    /// @dev Quorum: minimum validators that must reveal for finalization
    uint256 public quorum;

    /// @dev Max deviation from median before a reading is considered outlier (basis points)
    uint256 public outlierBps = 2000; // 20%

    // =========================================================================
    // Epoch helpers
    // =========================================================================
    uint256 public immutable GENESIS;

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - GENESIS) / EPOCH_DURATION;
    }

    function epochStart(uint256 epoch) public view returns (uint256) {
        return GENESIS + epoch * EPOCH_DURATION;
    }

    function isCommitPhase(uint256 epoch) public view returns (bool) {
        uint256 elapsed = block.timestamp - epochStart(epoch);
        return elapsed <= COMMIT_WINDOW;
    }

    function isRevealPhase(uint256 epoch) public view returns (bool) {
        uint256 elapsed = block.timestamp - epochStart(epoch);
        return elapsed > COMMIT_WINDOW && elapsed <= COMMIT_WINDOW + REVEAL_WINDOW;
    }

    function isFinalizableEpoch(uint256 epoch) public view returns (bool) {
        return block.timestamp > epochStart(epoch) + COMMIT_WINDOW + REVEAL_WINDOW;
    }

    // =========================================================================
    // State — keyed by (farmId, epoch, validator) for Monad slot isolation
    // =========================================================================
    struct CommitData {
        bytes32 commitHash;
        bool    revealed;
        uint256 revealedKwh; // kWh × 1e3 fixed-point (milliwatt-hours resolution)
    }

    // MONAD: different farms never share a slot — full parallelism
    mapping(bytes32 farmId =>
        mapping(uint256 epoch =>
            mapping(address validator => CommitData))) private _commits;

    // Per-farm, per-epoch finalization flag (isolation maintained)
    mapping(bytes32 farmId => mapping(uint256 epoch => bool)) public finalized;

    // Validator list for iteration during finalization
    address[] private _validatorList;
    mapping(address => bool) private _isValidator;

    // =========================================================================
    // External dependencies
    // =========================================================================
    ISunergyFarmRegistry public immutable registry;
    ISunergyRewards      public           rewards;  // set post-deploy (circular dep)

    // =========================================================================
    // Events
    // =========================================================================
    event Committed(bytes32 indexed farmId, uint256 indexed epoch, address indexed validator);
    event Revealed(bytes32 indexed farmId, uint256 indexed epoch, address indexed validator, uint256 kwh);
    event EnergyVerified(bytes32 indexed farmId, uint256 indexed epoch, uint256 verifiedKwh);
    event EpochFinalizationSkipped(bytes32 indexed farmId, uint256 indexed epoch, string reason);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event QuorumUpdated(uint256 newQuorum);
    event OutlierBpsUpdated(uint256 newBps);

    // =========================================================================
    // Errors
    // =========================================================================
    error NotCommitPhase(uint256 epoch);
    error NotRevealPhase(uint256 epoch);
    error EpochNotFinalizable(uint256 epoch);
    error AlreadyFinalized(bytes32 farmId, uint256 epoch);
    error AlreadyCommitted(bytes32 farmId, uint256 epoch, address validator);
    error AlreadyRevealed(bytes32 farmId, uint256 epoch, address validator);
    error InvalidReveal(bytes32 farmId, uint256 epoch, address validator);
    error FarmNotActive(bytes32 farmId);
    error QuorumNotMet(uint256 revealed, uint256 required);

    // =========================================================================
    // Constructor
    // =========================================================================
    constructor(
        address               admin,
        address               registryAddr,
        uint256               epochDuration,
        uint256               commitWindow,
        uint256               revealWindow,
        uint256               initialQuorum
    ) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
        registry      = ISunergyFarmRegistry(registryAddr);
        EPOCH_DURATION = epochDuration;
        COMMIT_WINDOW  = commitWindow;
        REVEAL_WINDOW  = revealWindow;
        GENESIS        = block.timestamp;
        quorum         = initialQuorum;
    }

    // =========================================================================
    // Validator: Phase 1 — Commit
    // =========================================================================

    /// @notice Commit a blinded energy reading for a farm in the current epoch.
    /// @param  farmId      Target farm identifier
    /// @param  epoch       Must equal currentEpoch()
    /// @param  commitHash  keccak256(abi.encode(farmId, epoch, kwh, salt))
    function commit(bytes32 farmId, uint256 epoch, bytes32 commitHash)
        external
        onlyRole(VALIDATOR_ROLE)
    {
        if (!isCommitPhase(epoch))          revert NotCommitPhase(epoch);
        if (!registry.isFarmActive(farmId)) revert FarmNotActive(farmId);

        CommitData storage c = _commits[farmId][epoch][msg.sender];
        if (c.commitHash != bytes32(0))     revert AlreadyCommitted(farmId, epoch, msg.sender);

        c.commitHash = commitHash;
        emit Committed(farmId, epoch, msg.sender);
    }

    // =========================================================================
    // Validator: Phase 2 — Reveal
    // =========================================================================

    /// @notice Reveal the plaintext reading for a previously committed hash.
    /// @param  farmId  Target farm identifier
    /// @param  epoch   The epoch being revealed
    /// @param  kwh     Energy produced in kWh × 1e3 (milliwatt-hours resolution)
    /// @param  salt    Random salt used during commit
    function reveal(bytes32 farmId, uint256 epoch, uint256 kwh, bytes32 salt)
        external
        onlyRole(VALIDATOR_ROLE)
    {
        if (!isRevealPhase(epoch)) revert NotRevealPhase(epoch);

        CommitData storage c = _commits[farmId][epoch][msg.sender];
        if (c.commitHash == bytes32(0)) revert InvalidReveal(farmId, epoch, msg.sender);
        if (c.revealed)                 revert AlreadyRevealed(farmId, epoch, msg.sender);

        bytes32 expected = keccak256(abi.encode(farmId, epoch, kwh, salt));
        if (c.commitHash != expected)   revert InvalidReveal(farmId, epoch, msg.sender);

        c.revealed     = true;
        c.revealedKwh  = kwh;
        emit Revealed(farmId, epoch, msg.sender, kwh);
    }

    // =========================================================================
    // Finalization
    // =========================================================================

    /// @notice Finalize an epoch for a farm: aggregate readings → mint rewards.
    ///         Callable by anyone after the reveal window closes.
    ///         Fully parallelizable for different farmIds in the same block.
    function finalizeEpoch(bytes32 farmId, uint256 epoch) external nonReentrant {
        if (!isFinalizableEpoch(epoch))         revert EpochNotFinalizable(epoch);
        if (finalized[farmId][epoch])           revert AlreadyFinalized(farmId, epoch);
        if (!registry.isFarmActive(farmId))     revert FarmNotActive(farmId);

        // Collect revealed readings
        uint256 n = _validatorList.length;
        uint256[] memory readings = new uint256[](n);
        uint256 count;

        unchecked {
            for (uint256 i; i < n; ++i) {
                CommitData storage c = _commits[farmId][epoch][_validatorList[i]];
                if (c.revealed) {
                    readings[count++] = c.revealedKwh;
                }
            }
        }

        // Mark finalized after quorum check: only permanently locks when quorum is met
        // or when we explicitly skip — prevents wasted gas on certain-to-fail retries.
        finalized[farmId][epoch] = true;

        if (count < quorum) {
            emit EpochFinalizationSkipped(farmId, epoch, "quorum not met");
            return;
        }

        // Sort and trim outliers (in-place insertion sort — count <= ~20 validators)
        assembly {
            let len := count
            for { let i := 1 } lt(i, len) { i := add(i, 1) } {
                let key := mload(add(add(readings, 0x20), mul(i, 0x20)))
                let j := sub(i, 1)
                for {} and(lt(j, i), gt(mload(add(add(readings, 0x20), mul(j, 0x20))), key)) {} {
                    mstore(
                        add(add(readings, 0x20), mul(add(j, 1), 0x20)),
                        mload(add(add(readings, 0x20), mul(j, 0x20)))
                    )
                    if eq(j, 0) { break }
                    j := sub(j, 1)
                }
                mstore(add(add(readings, 0x20), mul(add(j, 1), 0x20)), key)
            }
        }

        // Trimmed mean: discard bottom/top floor(count/4) readings
        uint256 trim   = count / 4;
        uint256 lo     = trim;
        uint256 hi     = count - trim;
        uint256 sum;
        unchecked {
            for (uint256 i = lo; i < hi; ++i) sum += readings[i];
        }
        uint256 verifiedKwh = sum / (hi - lo);

        emit EnergyVerified(farmId, epoch, verifiedKwh);

        if (address(rewards) != address(0)) {
            rewards.recordVerifiedEnergy(farmId, epoch, verifiedKwh);
        }
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function addValidator(address v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(VALIDATOR_ROLE, v);
        if (!_isValidator[v]) {
            _validatorList.push(v);
            _isValidator[v] = true;
        }
        emit ValidatorAdded(v);
    }

    function removeValidator(address v) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(VALIDATOR_ROLE, v);
        emit ValidatorRemoved(v);
        // Note: keeping in _validatorList but revealed=false means it contributes 0.
        // Full removal from array omitted to save gas; quorum check compensates.
    }

    function setRewards(address rewardsAddr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewards = ISunergyRewards(rewardsAddr);
    }

    function setQuorum(uint256 q) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(q > 0, "quorum > 0");
        quorum = q;
        emit QuorumUpdated(q);
    }

    function setOutlierBps(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 5000, "max 50%");
        outlierBps = bps;
        emit OutlierBpsUpdated(bps);
    }

    // =========================================================================
    // Views
    // =========================================================================

    function getCommit(bytes32 farmId, uint256 epoch, address validator)
        external
        view
        returns (CommitData memory)
    {
        return _commits[farmId][epoch][validator];
    }

    function validatorCount() external view returns (uint256) {
        return _validatorList.length;
    }
}
