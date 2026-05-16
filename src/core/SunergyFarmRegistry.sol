// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SunergyFarmRegistry
/// @notice Source-of-truth for all solar farms in the Sunergy protocol.
///
/// LIFECYCLE:
///   PENDING  → (auditor approves)  → ACTIVE
///   ACTIVE   → (admin suspends)    → SUSPENDED
///   SUSPENDED→ (admin reinstates)  → ACTIVE
///   ACTIVE   → (operator retires)  → RETIRED
///
/// MONAD PARALLELISM:
///   - All hot-path state is keyed by farmId (bytes32), ensuring zero
///     cross-farm storage contention when multiple farms are updated
///     in the same block.
///   - FarmMetadata (cold, set-once) and FarmStatus (hot, mutable)
///     occupy different storage slots to avoid read/write collisions
///     during speculative parallel execution.
contract SunergyFarmRegistry is AccessControl, Pausable, ReentrancyGuard {
    // =========================================================================
    // Roles
    // =========================================================================
    bytes32 public constant AUDITOR_ROLE  = keccak256("AUDITOR_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // =========================================================================
    // Types
    // =========================================================================
    enum FarmStatus { PENDING, ACTIVE, SUSPENDED, RETIRED }

    /// @dev Cold storage — set once at registration, never updated.
    ///      Packed into two 32-byte slots.
    struct FarmMetadata {
        bytes32 equipmentCertHash;   // hash of off-chain equipment certificate
        bytes32 deviceFingerprintHash; // hash of hardware IMEI/serial bundle
        bytes32 locationHash;        // keccak256(lat,lon) — avoids storing raw GPS
        uint32  nameplateCapacityW;  // rated capacity in watts (max ~4 GW per farm)
        uint32  registrationTime;
        uint16  countryCode;         // ISO 3166-1 numeric
        uint8   _pad;
    }

    /// @dev Hot storage — updated during audits and operational events.
    ///      Kept in a separate mapping to minimize slot overlap with cold data.
    struct FarmState {
        FarmStatus status;
        address    operator;          // address entitled to claim rewards
        uint32     activationTime;    // block.timestamp when status → ACTIVE
        uint32     lastAuditTime;
        uint32     suspensionCount;
    }

    // =========================================================================
    // State
    // =========================================================================

    /// @dev farmId is derived as keccak256(abi.encode(operator, deviceFingerprintHash))
    ///      at registration time. It is the sole key for all downstream accounting.

    // Cold path — separate mapping for Monad slot isolation
    mapping(bytes32 farmId => FarmMetadata) private _metadata;

    // Hot path — separate mapping
    mapping(bytes32 farmId => FarmState)    private _state;

    // Reverse index: operator → set of farmIds (capped to prevent DoS)
    mapping(address operator => bytes32[])  private _operatorFarms;
    mapping(bytes32 farmId => bool)         private _exists;

    uint256 public totalFarms;
    uint256 public activeFarms;

    /// @notice Minimum collateral an operator must bond when registering a farm.
    ///         Slashable on fraudulent readings.
    uint256 public operatorBond;

    // Collateral balances — keyed by operator, not farmId, because one operator
    // may run multiple farms under a single bond.
    mapping(address operator => uint256) public bonds;

    // =========================================================================
    // Events
    // =========================================================================
    event FarmRegistered(bytes32 indexed farmId, address indexed operator, uint32 capacityW);
    event FarmActivated(bytes32 indexed farmId, address indexed auditor);
    event FarmSuspended(bytes32 indexed farmId, address indexed by, string reason);
    event FarmReinstated(bytes32 indexed farmId);
    event FarmRetired(bytes32 indexed farmId);
    event BondDeposited(address indexed operator, uint256 amount);
    event BondSlashed(address indexed operator, uint256 amount, bytes32 indexed farmId);
    event OperatorBondUpdated(uint256 newBond);

    // =========================================================================
    // Errors
    // =========================================================================
    error FarmAlreadyExists(bytes32 farmId);
    error FarmNotFound(bytes32 farmId);
    error FarmNotPending(bytes32 farmId);
    error FarmNotActive(bytes32 farmId);
    error FarmNotSuspended(bytes32 farmId);
    error InsufficientBond(uint256 required, uint256 provided);
    error Unauthorized();
    error MaxFarmsPerOperator();

    uint256 private constant MAX_FARMS_PER_OPERATOR = 50;

    // =========================================================================
    // Constructor
    // =========================================================================
    constructor(address admin, uint256 initialBond) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        operatorBond = initialBond;
    }

    // =========================================================================
    // Operator actions
    // =========================================================================

    /// @notice Register a new solar farm. Caller must have deposited >= operatorBond.
    /// @param  deviceFingerprintHash  keccak256 of device serial / IMEI bundle
    /// @param  equipmentCertHash      keccak256 of off-chain equipment certificate
    /// @param  locationHash           keccak256(abi.encode(lat_e7, lon_e7))
    /// @param  nameplateCapacityW     rated capacity in watts
    /// @param  countryCode            ISO 3166-1 numeric country code
    /// @return farmId                 Unique identifier for this farm
    function registerFarm(
        bytes32 deviceFingerprintHash,
        bytes32 equipmentCertHash,
        bytes32 locationHash,
        uint32  nameplateCapacityW,
        uint16  countryCode
    ) external payable whenNotPaused nonReentrant returns (bytes32 farmId) {
        address operator = msg.sender;

        // Credit any attached value to bond balance
        if (msg.value > 0) {
            bonds[operator] += msg.value;
            emit BondDeposited(operator, msg.value);
        }

        if (bonds[operator] < operatorBond) {
            revert InsufficientBond(operatorBond, bonds[operator]);
        }

        if (_operatorFarms[operator].length >= MAX_FARMS_PER_OPERATOR) {
            revert MaxFarmsPerOperator();
        }

        farmId = keccak256(abi.encode(operator, deviceFingerprintHash));

        if (_exists[farmId]) revert FarmAlreadyExists(farmId);

        _metadata[farmId] = FarmMetadata({
            equipmentCertHash:     equipmentCertHash,
            deviceFingerprintHash: deviceFingerprintHash,
            locationHash:          locationHash,
            nameplateCapacityW:    nameplateCapacityW,
            registrationTime:      uint32(block.timestamp),
            countryCode:           countryCode,
            _pad:                  0
        });

        _state[farmId] = FarmState({
            status:          FarmStatus.PENDING,
            operator:        operator,
            activationTime:  0,
            lastAuditTime:   0,
            suspensionCount: 0
        });

        _exists[farmId]  = true;
        _operatorFarms[operator].push(farmId);
        ++totalFarms;

        emit FarmRegistered(farmId, operator, nameplateCapacityW);
    }

    /// @notice Operator retires their own farm permanently.
    function retireFarm(bytes32 farmId) external {
        FarmState storage s = _getState(farmId);
        if (s.operator != msg.sender) revert Unauthorized();
        if (s.status != FarmStatus.ACTIVE && s.status != FarmStatus.SUSPENDED) {
            revert FarmNotActive(farmId);
        }
        if (s.status == FarmStatus.ACTIVE) --activeFarms;
        s.status = FarmStatus.RETIRED;
        emit FarmRetired(farmId);
    }

    // =========================================================================
    // Auditor actions
    // =========================================================================

    /// @notice Approve a pending farm after off-chain audit is complete.
    function activateFarm(bytes32 farmId) external onlyRole(AUDITOR_ROLE) {
        FarmState storage s = _getState(farmId);
        if (s.status != FarmStatus.PENDING) revert FarmNotPending(farmId);
        s.status         = FarmStatus.ACTIVE;
        s.activationTime = uint32(block.timestamp);
        s.lastAuditTime  = uint32(block.timestamp);
        ++activeFarms;
        emit FarmActivated(farmId, msg.sender);
    }

    /// @notice Suspend an active farm (e.g., failed audit, oracle fraud detected).
    function suspendFarm(bytes32 farmId, string calldata reason)
        external
        onlyRole(AUDITOR_ROLE)
    {
        FarmState storage s = _getState(farmId);
        if (s.status != FarmStatus.ACTIVE) revert FarmNotActive(farmId);
        s.status = FarmStatus.SUSPENDED;
        ++s.suspensionCount;
        --activeFarms;
        emit FarmSuspended(farmId, msg.sender, reason);
    }

    /// @notice Reinstate a suspended farm after remediation.
    function reinstateFarm(bytes32 farmId) external onlyRole(AUDITOR_ROLE) {
        FarmState storage s = _getState(farmId);
        if (s.status != FarmStatus.SUSPENDED) revert FarmNotSuspended(farmId);
        s.status        = FarmStatus.ACTIVE;
        s.lastAuditTime = uint32(block.timestamp);
        ++activeFarms;
        emit FarmReinstated(farmId);
    }

    // =========================================================================
    // Admin: slashing
    // =========================================================================

    /// @notice Slash a portion of an operator's bond (called by SunergyOracle on fraud).
    /// @dev    AUDITOR_ROLE is also granted to SunergyOracle at deploy time.
    function slashBond(address operator, uint256 amount, bytes32 farmId)
        external
        onlyRole(AUDITOR_ROLE)
    {
        uint256 available = bonds[operator];
        uint256 slash     = amount > available ? available : amount;
        bonds[operator]   = available - slash;
        // Slashed funds stay in contract, redeemable by DAO via governance
        emit BondSlashed(operator, slash, farmId);
    }

    /// @notice Update required bond amount (governance-controlled).
    function setOperatorBond(uint256 newBond) external onlyRole(DEFAULT_ADMIN_ROLE) {
        operatorBond = newBond;
        emit OperatorBondUpdated(newBond);
    }

    // =========================================================================
    // Views
    // =========================================================================

    function getFarmMetadata(bytes32 farmId) external view returns (FarmMetadata memory) {
        return _metadata[_requireExists(farmId)];
    }

    function getFarmState(bytes32 farmId) external view returns (FarmState memory) {
        return _state[_requireExists(farmId)];
    }

    function isFarmActive(bytes32 farmId) external view returns (bool) {
        return _exists[farmId] && _state[farmId].status == FarmStatus.ACTIVE;
    }

    function getFarmOperator(bytes32 farmId) external view returns (address) {
        return _state[_requireExists(farmId)].operator;
    }

    function getOperatorFarms(address operator) external view returns (bytes32[] memory) {
        return _operatorFarms[operator];
    }

    // =========================================================================
    // Pause
    // =========================================================================
    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // =========================================================================
    // Internal helpers
    // =========================================================================
    function _requireExists(bytes32 farmId) internal view returns (bytes32) {
        if (!_exists[farmId]) revert FarmNotFound(farmId);
        return farmId;
    }

    function _getState(bytes32 farmId) internal view returns (FarmState storage) {
        if (!_exists[farmId]) revert FarmNotFound(farmId);
        return _state[farmId];
    }
}
