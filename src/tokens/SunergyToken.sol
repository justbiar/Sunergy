// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title SunergyToken (SNR)
/// @notice Governance + reward token for the Sunergy protocol.
///         Minting is exclusively controlled by SunergyRewards via MINTER_ROLE.
///         Supports EIP-2612 gasless approvals and on-chain governance via ERC20Votes.
contract SunergyToken is ERC20, ERC20Permit, ERC20Votes, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev 1 billion SNR hard cap
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    constructor(address admin) ERC20("Sunergy", "SNR") ERC20Permit("Sunergy") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Mint SNR to `to`. Only callable by MINTER_ROLE (SunergyRewards).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "SNR: cap exceeded");
        _mint(to, amount);
    }

    // -------------------------------------------------------------------------
    // Required overrides (ERC20Votes + ERC20Permit share Nonces)
    // -------------------------------------------------------------------------

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
