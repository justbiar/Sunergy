// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISunergyRewards {
    function recordVerifiedEnergy(bytes32 farmId, uint256 epoch, uint256 verifiedKwh) external;
}
