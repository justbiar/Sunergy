// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISunergyFarmRegistry {
    function isFarmActive(bytes32 farmId) external view returns (bool);
    function getFarmOperator(bytes32 farmId) external view returns (address);
    function slashBond(address operator, uint256 amount, bytes32 farmId) external;
}
