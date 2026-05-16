// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SunergyToken} from "../../src/tokens/SunergyToken.sol";
import {SunergyCarbonCredit} from "../../src/tokens/SunergyCarbonCredit.sol";
import {SunergyFarmRegistry} from "../../src/core/SunergyFarmRegistry.sol";
import {SunergyRewards} from "../../src/core/SunergyRewards.sol";
import {SunergyOracle} from "../../src/oracle/SunergyOracle.sol";

/// @notice End-to-end test: oracle commit → reveal → finalize → rewards claimed
contract OracleToRewardsIntegrationTest is Test {
    SunergyToken        public snr;
    SunergyCarbonCredit public carbon;
    SunergyFarmRegistry public registry;
    SunergyRewards      public rewards;
    SunergyOracle       public oracle;

    address admin    = makeAddr("admin");
    address auditor  = makeAddr("auditor");
    address operator = makeAddr("operator");

    address v1 = makeAddr("validator1");
    address v2 = makeAddr("validator2");
    address v3 = makeAddr("validator3");

    uint256 constant BOND = 1 ether;

    // Oracle timing
    uint256 constant EPOCH_DURATION = 1 hours;
    uint256 constant COMMIT_WINDOW  = 30 minutes;
    uint256 constant REVEAL_WINDOW  = 20 minutes;

    bytes32 public farmId;

    function setUp() public {
        vm.startPrank(admin);

        registry = new SunergyFarmRegistry(admin, BOND);
        registry.grantRole(registry.AUDITOR_ROLE(), auditor);

        snr    = new SunergyToken(admin);
        carbon = new SunergyCarbonCredit(admin, "https://sunergy.xyz/api/carbon/{id}.json");

        oracle = new SunergyOracle(
            admin,
            address(registry),
            EPOCH_DURATION,
            COMMIT_WINDOW,
            REVEAL_WINDOW,
            2   // quorum = 2 validators
        );

        rewards = new SunergyRewards(
            admin,
            address(oracle),
            address(registry),
            address(snr),
            address(carbon),
            10 ether,  // 10 SNR per kWh
            1000,      // 1000 kWh per carbon credit
            8760,
            0
        );

        snr.grantRole(snr.MINTER_ROLE(), address(rewards));
        carbon.grantRole(carbon.MINTER_ROLE(), address(rewards));
        registry.grantRole(registry.AUDITOR_ROLE(), address(oracle));

        oracle.setRewards(address(rewards));
        oracle.addValidator(v1);
        oracle.addValidator(v2);
        oracle.addValidator(v3);

        vm.stopPrank();

        // Register and activate farm
        vm.deal(operator, BOND);
        vm.prank(operator);
        farmId = registry.registerFarm{value: BOND}(
            keccak256("fp"), keccak256("cert"), keccak256("loc"), 100_000, 840
        );
        vm.prank(auditor);
        registry.activateFarm(farmId);
    }

    function test_full_flow_commit_reveal_finalize_claim() public {
        uint256 epoch = oracle.currentEpoch();

        // kWh values (×1e3) — v1 and v2 agree, v3 is an outlier
        uint256 kwhV1 = 500_000;
        uint256 kwhV2 = 505_000;
        uint256 kwhV3 = 999_999; // outlier (trimmed)

        bytes32 saltV1 = keccak256("salt1");
        bytes32 saltV2 = keccak256("salt2");
        bytes32 saltV3 = keccak256("salt3");

        // --- Phase 1: Commit ---
        vm.prank(v1);
        oracle.commit(farmId, epoch, keccak256(abi.encode(farmId, epoch, kwhV1, saltV1)));
        vm.prank(v2);
        oracle.commit(farmId, epoch, keccak256(abi.encode(farmId, epoch, kwhV2, saltV2)));
        vm.prank(v3);
        oracle.commit(farmId, epoch, keccak256(abi.encode(farmId, epoch, kwhV3, saltV3)));

        // --- Advance to reveal window ---
        vm.warp(block.timestamp + COMMIT_WINDOW + 1);

        // --- Phase 2: Reveal ---
        vm.prank(v1);
        oracle.reveal(farmId, epoch, kwhV1, saltV1);
        vm.prank(v2);
        oracle.reveal(farmId, epoch, kwhV2, saltV2);
        vm.prank(v3);
        oracle.reveal(farmId, epoch, kwhV3, saltV3);

        // --- Advance past reveal window ---
        vm.warp(block.timestamp + REVEAL_WINDOW + 1);

        // --- Finalization ---
        oracle.finalizeEpoch(farmId, epoch);
        assertTrue(oracle.finalized(farmId, epoch), "Epoch should be finalized");

        // Rewards should have been accrued
        (uint256 pending,) = rewards.pendingRewards(farmId);
        assertGt(pending, 0, "Rewards should have accrued");

        // --- Claim ---
        vm.prank(operator);
        rewards.claimRewards(farmId);

        assertGt(snr.balanceOf(operator), 0, "Operator should hold SNR");
    }

    function test_finalize_reverts_below_quorum() public {
        uint256 epoch = oracle.currentEpoch();
        bytes32 salt  = keccak256("salt");
        uint256 kwh   = 500_000;

        // Only 1 validator commits+reveals (quorum = 2)
        vm.prank(v1);
        oracle.commit(farmId, epoch, keccak256(abi.encode(farmId, epoch, kwh, salt)));

        vm.warp(block.timestamp + COMMIT_WINDOW + 1);

        vm.prank(v1);
        oracle.reveal(farmId, epoch, kwh, salt);

        vm.warp(block.timestamp + REVEAL_WINDOW + 1);

        // Should emit skip event, not revert
        vm.expectEmit(true, true, false, false);
        emit SunergyOracle.EpochFinalizationSkipped(farmId, epoch, "quorum not met");
        oracle.finalizeEpoch(farmId, epoch);
    }

    function test_double_finalization_reverts() public {
        uint256 epoch = oracle.currentEpoch();
        bytes32 salt1 = keccak256("s1");
        bytes32 salt2 = keccak256("s2");

        vm.prank(v1);
        oracle.commit(farmId, epoch, keccak256(abi.encode(farmId, epoch, uint256(500_000), salt1)));
        vm.prank(v2);
        oracle.commit(farmId, epoch, keccak256(abi.encode(farmId, epoch, uint256(500_000), salt2)));

        vm.warp(block.timestamp + COMMIT_WINDOW + 1);

        vm.prank(v1); oracle.reveal(farmId, epoch, 500_000, salt1);
        vm.prank(v2); oracle.reveal(farmId, epoch, 500_000, salt2);

        vm.warp(block.timestamp + REVEAL_WINDOW + 1);

        oracle.finalizeEpoch(farmId, epoch);

        vm.expectRevert(
            abi.encodeWithSelector(SunergyOracle.AlreadyFinalized.selector, farmId, epoch)
        );
        oracle.finalizeEpoch(farmId, epoch);
    }
}
