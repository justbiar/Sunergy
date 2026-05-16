// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SunergyFarmRegistry} from "../../src/core/SunergyFarmRegistry.sol";

contract FarmRegistryTest is Test {
    SunergyFarmRegistry public registry;

    address admin    = makeAddr("admin");
    address auditor  = makeAddr("auditor");
    address operator = makeAddr("operator");
    address attacker = makeAddr("attacker");

    uint256 constant BOND = 1 ether;

    bytes32 constant DEVICE_FP    = keccak256("device-fingerprint-001");
    bytes32 constant EQUIP_CERT   = keccak256("equipment-cert-001");
    bytes32 constant LOCATION     = keccak256(abi.encode(int256(37_774_929), int256(-122_419_416)));

    function setUp() public {
        vm.startPrank(admin);
        registry = new SunergyFarmRegistry(admin, BOND);
        registry.grantRole(registry.AUDITOR_ROLE(), auditor);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    function test_registerFarm_success() public {
        vm.deal(operator, BOND);
        vm.prank(operator);
        bytes32 farmId = registry.registerFarm{value: BOND}(
            DEVICE_FP, EQUIP_CERT, LOCATION, 100_000, 840
        );

        assertFalse(registry.isFarmActive(farmId));
        assertEq(registry.getFarmOperator(farmId), operator);
        assertEq(registry.totalFarms(), 1);
    }

    function test_registerFarm_reverts_insufficient_bond() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SunergyFarmRegistry.InsufficientBond.selector,
                BOND,
                0
            )
        );
        registry.registerFarm(DEVICE_FP, EQUIP_CERT, LOCATION, 100_000, 840);
    }

    function test_registerFarm_reverts_duplicate() public {
        vm.deal(operator, BOND * 2);
        vm.startPrank(operator);
        registry.registerFarm{value: BOND}(DEVICE_FP, EQUIP_CERT, LOCATION, 100_000, 840);

        bytes32 expectedId = keccak256(abi.encode(operator, DEVICE_FP));
        vm.expectRevert(
            abi.encodeWithSelector(SunergyFarmRegistry.FarmAlreadyExists.selector, expectedId)
        );
        registry.registerFarm{value: 0}(DEVICE_FP, EQUIP_CERT, LOCATION, 100_000, 840);
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    function _registerAndActivate() internal returns (bytes32 farmId) {
        vm.deal(operator, BOND);
        vm.prank(operator);
        farmId = registry.registerFarm{value: BOND}(
            DEVICE_FP, EQUIP_CERT, LOCATION, 100_000, 840
        );
        vm.prank(auditor);
        registry.activateFarm(farmId);
    }

    function test_activateFarm() public {
        bytes32 farmId = _registerAndActivate();
        assertTrue(registry.isFarmActive(farmId));
        assertEq(registry.activeFarms(), 1);
    }

    function test_suspendAndReinstate() public {
        bytes32 farmId = _registerAndActivate();

        vm.prank(auditor);
        registry.suspendFarm(farmId, "test suspension");
        assertFalse(registry.isFarmActive(farmId));
        assertEq(registry.activeFarms(), 0);

        vm.prank(auditor);
        registry.reinstateFarm(farmId);
        assertTrue(registry.isFarmActive(farmId));
        assertEq(registry.activeFarms(), 1);
    }

    function test_retireFarm() public {
        bytes32 farmId = _registerAndActivate();
        vm.prank(operator);
        registry.retireFarm(farmId);
        assertFalse(registry.isFarmActive(farmId));
    }

    function test_retireFarm_reverts_unauthorized() public {
        bytes32 farmId = _registerAndActivate();
        vm.prank(attacker);
        vm.expectRevert(SunergyFarmRegistry.Unauthorized.selector);
        registry.retireFarm(farmId);
    }

    // -------------------------------------------------------------------------
    // Bond slashing
    // -------------------------------------------------------------------------

    function test_slashBond() public {
        vm.deal(operator, BOND);
        vm.prank(operator);
        registry.registerFarm{value: BOND}(DEVICE_FP, EQUIP_CERT, LOCATION, 100_000, 840);

        bytes32 farmId = keccak256(abi.encode(operator, DEVICE_FP));
        uint256 slashAmount = BOND / 2;

        vm.prank(auditor);
        registry.slashBond(operator, slashAmount, farmId);

        assertEq(registry.bonds(operator), BOND - slashAmount);
    }

    // -------------------------------------------------------------------------
    // Fuzz
    // -------------------------------------------------------------------------

    function testFuzz_registerFarm_differentOperators(address op1, address op2) public {
        vm.assume(op1 != op2);
        vm.assume(op1 != address(0) && op2 != address(0));

        vm.deal(op1, BOND);
        vm.deal(op2, BOND);

        vm.prank(op1);
        bytes32 id1 = registry.registerFarm{value: BOND}(
            keccak256("fp1"), keccak256("cert1"), LOCATION, 50_000, 840
        );

        vm.prank(op2);
        bytes32 id2 = registry.registerFarm{value: BOND}(
            keccak256("fp2"), keccak256("cert2"), LOCATION, 50_000, 840
        );

        assertTrue(id1 != id2, "farmIds must be unique");
        assertEq(registry.totalFarms(), 2);
    }
}
