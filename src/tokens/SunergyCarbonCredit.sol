// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title SunergyCarbonCredit
/// @notice ERC-1155 carbon offset tokens issued by SunergyRewards.
///
/// TOKEN ID SCHEME:
///   tokenId = vintageYear (e.g., 2024, 2025 …)
///   Each unit = 1 tonne CO₂e verified by Sunergy solar farms.
///
/// RETIREMENT:
///   Holders permanently burn credits by calling retire().
///   Emits CreditRetired for off-chain VCM registry indexing.
contract SunergyCarbonCredit is ERC1155, ERC1155Supply, AccessControl {
    bytes32 public constant MINTER_ROLE  = keccak256("MINTER_ROLE");
    bytes32 public constant URI_SETTER_ROLE = keccak256("URI_SETTER_ROLE");

    /// @dev Global retirement ledger — queryable by VCM registries
    mapping(address holder => mapping(uint256 vintageYear => uint256)) public retired;
    uint256 public totalRetired;

    event CreditRetired(
        address indexed retiree,
        uint256 indexed vintageYear,
        uint256 amount,
        string  beneficiary
    );

    error ZeroAmount();
    error InsufficientBalance(uint256 have, uint256 want);

    constructor(address admin, string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(URI_SETTER_ROLE, admin);
    }

    // =========================================================================
    // Minting — called by SunergyRewards (MINTER_ROLE)
    // =========================================================================

    /// @notice Mint `amount` credits of the current vintage year to `to`.
    ///         tokenId = current calendar year derived from block.timestamp.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (amount == 0) revert ZeroAmount();
        uint256 vintageYear = _currentYear();
        _mint(to, vintageYear, amount, "");
    }

    /// @notice Mint to a specific vintage year (for back-dating via governance).
    function mintVintage(address to, uint256 vintageYear, uint256 amount)
        external
        onlyRole(MINTER_ROLE)
    {
        if (amount == 0) revert ZeroAmount();
        _mint(to, vintageYear, amount, "");
    }

    // =========================================================================
    // Retirement — permanent burn
    // =========================================================================

    /// @notice Retire (permanently burn) carbon credits on behalf of `beneficiary`.
    ///         Beneficiary string is stored off-chain by indexers.
    function retire(uint256 vintageYear, uint256 amount, string calldata beneficiary)
        external
    {
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balanceOf(msg.sender, vintageYear);
        if (bal < amount) revert InsufficientBalance(bal, amount);

        _burn(msg.sender, vintageYear, amount);

        unchecked {
            retired[msg.sender][vintageYear] += amount;
            totalRetired                     += amount;
        }

        emit CreditRetired(msg.sender, vintageYear, amount, beneficiary);
    }

    // =========================================================================
    // Metadata
    // =========================================================================

    function setURI(string calldata newuri) external onlyRole(URI_SETTER_ROLE) {
        _setURI(newuri);
    }

    // =========================================================================
    // Required overrides
    // =========================================================================

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // =========================================================================
    // Internal
    // =========================================================================

    function _currentYear() internal view returns (uint256) {
        // Approximate: seconds since Unix epoch ÷ seconds per year
        // Accurate within ±1 year; good enough for vintage bucketing.
        return 1970 + block.timestamp / 365.25 days;
    }
}
