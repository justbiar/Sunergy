// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {SunergyToken} from "../../src/tokens/SunergyToken.sol";
import {SunergyCarbonCredit} from "../../src/tokens/SunergyCarbonCredit.sol";
import {SunergyFarmRegistry} from "../../src/core/SunergyFarmRegistry.sol";
import {SunergyRewards} from "../../src/core/SunergyRewards.sol";

contract RewardsTest is Test {
    SunergyToken        public snr;
    SunergyCarbonCredit public carbon;
    SunergyFarmRegistry public registry;
    SunergyRewards      public rewards;

    address admin    = makeAddr("admin");
    address auditor  = makeAddr("auditor");
    address oracle   = makeAddr("oracle");
    address operator = makeAddr("operator");

    uint256 constant BOND           = 1 ether;
    uint256 constant SNR_PER_KWH    = 10 ether;   // 10 SNR per kWh
    uint256 constant CARBON_KWH_RATE = 1000;       // 1000 kWh → 1 tonne

    bytes32 public farmId;

    function setUp() public {
        vm.startPrank(admin);

        registry = new SunergyFarmRegistry(admin, BOND);
        registry.grantRole(registry.AUDITOR_ROLE(), auditor);

        snr    = new SunergyToken(admin);
        carbon = new SunergyCarbonCredit(admin, "https://sunergy.xyz/api/carbon/{id}.json");

        rewards = new SunergyRewards(
            admin,
            oracle,
            address(registry),
            address(snr),
            address(carbon),
            SNR_PER_KWH,
            CARBON_KWH_RATE,
            8760,  // halving every 8760 epochs
            0      // genesis epoch 0
        );

        snr.grantRole(snr.MINTER_ROLE(), address(rewards));
        carbon.grantRole(carbon.MINTER_ROLE(), address(rewards));
        registry.grantRole(registry.AUDITOR_ROLE(), address(rewards));

        vm.stopPrank();

        // Register and activate a farm
        vm.deal(operator, BOND);
        vm.prank(operator);
        farmId = registry.registerFarm{value: BOND}(
            keccak256("fp"), keccak256("cert"), keccak256("loc"), 100_000, 840
        );
        vm.prank(auditor);
        registry.activateFarm(farmId);
    }

    // -------------------------------------------------------------------------
    // recordVerifiedEnergy
    // -------------------------------------------------------------------------

    function test_recordEnergy_accruesToPending() public {
        uint256 kwh = 500_000; // 500 kWh × 1e3 = 500,000 in mWh units

        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, kwh);

        (uint256 pendingSnr, uint256 pendingCarbon) = rewards.pendingRewards(farmId);
        assertGt(pendingSnr, 0,  "SNR should accrue");
        // 500,000 mWh = 500 kWh → 500 kWh < 1000 kWh threshold, so 0 carbon credits yet
        assertEq(pendingCarbon, 0, "Not enough kWh for a carbon credit yet");
    }

    function test_recordEnergy_reverts_duplicate_epoch() public {
        vm.startPrank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, 100_000);
        vm.expectRevert(
            abi.encodeWithSelector(SunergyRewards.AlreadyProcessed.selector, farmId, 1)
        );
        rewards.recordVerifiedEnergy(farmId, 1, 100_000);
        vm.stopPrank();
    }

    function test_recordEnergy_reverts_zero_kwh() public {
        vm.prank(oracle);
        vm.expectRevert(SunergyRewards.ZeroKwh.selector);
        rewards.recordVerifiedEnergy(farmId, 1, 0);
    }

    // -------------------------------------------------------------------------
    // claimRewards
    // -------------------------------------------------------------------------

    function test_claimRewards_mints_snr() public {
        uint256 kwh = 1_000_000; // 1000 kWh
        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, kwh);

        vm.prank(operator);
        rewards.claimRewards(farmId);

        assertGt(snr.balanceOf(operator), 0, "Operator should have SNR");
    }

    function test_claimRewards_mints_carbon_credits() public {
        // Enough kWh to earn exactly 1 carbon credit (1,000,000 mWh = 1000 kWh)
        uint256 kwh = 1_000_000;
        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, kwh);

        vm.prank(operator);
        rewards.claimRewards(farmId);

        uint256 vintageYear = 1970 + block.timestamp / 365.25 days;
        assertEq(carbon.balanceOf(operator, vintageYear), 1, "Should have 1 carbon credit");
    }

    function test_claimRewards_zeroes_pending() public {
        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, 500_000);

        vm.prank(operator);
        rewards.claimRewards(farmId);

        assertEq(rewards.pendingSnr(farmId), 0, "Pending SNR should be zeroed");
    }

    function test_claimRewards_reverts_nothing_to_claim() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SunergyRewards.NothingToClaim.selector, farmId)
        );
        rewards.claimRewards(farmId);
    }

    function test_claimRewards_only_operator() public {
        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, 500_000);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert();
        rewards.claimRewards(farmId);
    }

    // -------------------------------------------------------------------------
    // Halving
    // -------------------------------------------------------------------------

    function test_effectiveRate_halves_over_intervals() public view {
        uint256 rate0 = rewards.effectiveSnrRate(0);
        uint256 rate1 = rewards.effectiveSnrRate(8760);
        uint256 rate2 = rewards.effectiveSnrRate(17520);

        assertEq(rate0, SNR_PER_KWH,    "Epoch 0 = base rate");
        assertEq(rate1, SNR_PER_KWH / 2, "After 1 halving = half rate");
        assertEq(rate2, SNR_PER_KWH / 4, "After 2 halvings = quarter rate");
    }

    // -------------------------------------------------------------------------
    // Fuzz: reward math invariants
    // -------------------------------------------------------------------------

    function testFuzz_pendingSnr_never_exceeds_cap(uint256 kwh) public {
        kwh = bound(kwh, 1, 1_000_000_000); // 1 to 1 billion mWh

        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, kwh);

        uint256 pending = rewards.pendingSnr(farmId);
        // pending = kwh * SNR_PER_KWH / 1e3
        uint256 expected = kwh * SNR_PER_KWH / 1e3;
        assertEq(pending, expected, "Pending SNR formula mismatch");
    }

    function testFuzz_carbon_credits_floor(uint256 kwh) public {
        kwh = bound(kwh, 1, 100_000_000);

        vm.prank(oracle);
        rewards.recordVerifiedEnergy(farmId, 1, kwh);

        (, uint256 credits) = rewards.pendingRewards(farmId);
        // verifiedKwh is in mWh×1e3, real kWh = kwh/1e3; then divide by carbonKwhRate
        uint256 expected = (kwh / 1e3) / CARBON_KWH_RATE;
        assertEq(credits, expected, "Carbon credit floor mismatch");
    }
}
