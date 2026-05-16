// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SunergyToken} from "../src/tokens/SunergyToken.sol";
import {SunergyCarbonCredit} from "../src/tokens/SunergyCarbonCredit.sol";
import {SunergyFarmRegistry} from "../src/core/SunergyFarmRegistry.sol";
import {SunergyRewards} from "../src/core/SunergyRewards.sol";
import {SunergyOracle} from "../src/oracle/SunergyOracle.sol";

/// @notice Deploys the full Sunergy protocol.
///         Run:  forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    // =========================================================================
    // Config — override with env vars
    // =========================================================================

    function _admin() internal view returns (address) {
        return vm.envOr("ADMIN_ADDRESS", msg.sender);
    }

    // Oracle timing: 1-hour epochs, 30-min commit, 20-min reveal
    uint256 constant EPOCH_DURATION = 1 hours;
    uint256 constant COMMIT_WINDOW  = 30 minutes;
    uint256 constant REVEAL_WINDOW  = 20 minutes;

    // Tokenomics
    uint256 constant SNR_PER_KWH     = 10 ether;  // 10 SNR per kWh
    uint256 constant CARBON_KWH_RATE = 1_000;     // 1000 kWh → 1 tonne CO₂e
    uint256 constant HALVING_INTERVAL = 8_760;    // ~1 year at 1h epochs
    uint256 constant OPERATOR_BOND   = 0.1 ether; // testnet-friendly

    // =========================================================================
    // Deploy
    // =========================================================================

    function run() external {
        address admin = _admin();
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Registry
        SunergyFarmRegistry registry = new SunergyFarmRegistry(admin, OPERATOR_BOND);
        console2.log("SunergyFarmRegistry:", address(registry));

        // 2. Tokens
        SunergyToken snr = new SunergyToken(admin);
        console2.log("SunergyToken (SNR):", address(snr));

        SunergyCarbonCredit carbon = new SunergyCarbonCredit(
            admin,
            "https://sunergy.xyz/api/carbon/{id}.json"
        );
        console2.log("SunergyCarbonCredit:", address(carbon));

        // 3. Oracle (rewards addr set after deploy)
        SunergyOracle oracle = new SunergyOracle(
            admin,
            address(registry),
            EPOCH_DURATION,
            COMMIT_WINDOW,
            REVEAL_WINDOW,
            2   // quorum: 2 validators must reveal
        );
        console2.log("SunergyOracle:", address(oracle));

        // 4. Rewards
        SunergyRewards rewards = new SunergyRewards(
            admin,
            address(oracle),
            address(registry),
            address(snr),
            address(carbon),
            SNR_PER_KWH,
            CARBON_KWH_RATE,
            HALVING_INTERVAL,
            oracle.currentEpoch()
        );
        console2.log("SunergyRewards:", address(rewards));

        // 5. Wire permissions
        snr.grantRole(snr.MINTER_ROLE(), address(rewards));
        carbon.grantRole(carbon.MINTER_ROLE(), address(rewards));
        registry.grantRole(registry.AUDITOR_ROLE(), address(oracle));
        oracle.setRewards(address(rewards));

        vm.stopBroadcast();

        console2.log("\n=== Deployment Complete ===");
        console2.log("Network:           Monad Testnet");
        console2.log("Admin:            ", admin);
        console2.log("FarmRegistry:     ", address(registry));
        console2.log("SNR Token:        ", address(snr));
        console2.log("Carbon Credit:    ", address(carbon));
        console2.log("Oracle:           ", address(oracle));
        console2.log("Rewards:          ", address(rewards));
    }
}
