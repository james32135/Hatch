// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {HATCHLog} from "../src/HATCHLog.sol";
import {HATCHSchedule} from "../src/HATCHSchedule.sol";

/**
 * Deploy HATCHLog + HATCHSchedule to ValueChain.
 * Testnet first. Never use deployer key as SoDEX user trading key.
 */
contract DeployHATCHLog is Script {
    function run() external {
        vm.startBroadcast();
        HATCHLog log = new HATCHLog();
        HATCHSchedule schedule = new HATCHSchedule();
        console2.log("HATCHLog", address(log));
        console2.log("HATCHSchedule", address(schedule));
        console2.log("deployer", log.deployer());
        console2.log("chainid", block.chainid);
        vm.stopBroadcast();
    }
}
