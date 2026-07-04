// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {HATCHLog} from "../src/HATCHLog.sol";
import {HATCHSchedule} from "../src/HATCHSchedule.sol";

contract HATCHLogTest is Test {
    HATCHLog internal hatchLog;
    HATCHSchedule internal schedule;
    address internal parent = address(0xBEEF);

    function setUp() public {
        hatchLog = new HATCHLog();
        schedule = new HATCHSchedule();
    }

    function test_deployer_is_msgSender() public view {
        assertEq(hatchLog.deployer(), address(this));
        assertEq(schedule.deployer(), address(this));
    }

    function test_emitChildRegistered() public {
        bytes32 childId = keccak256("child1");
        vm.prank(parent);
        vm.expectEmit(true, true, false, true);
        emit HATCHLog.ChildRegistered(childId, parent, 10);
        hatchLog.emitChildRegistered(childId, 10);
    }

    function test_emitAllowanceExecuted() public {
        bytes32 childId = keccak256("child1");
        bytes32 ref = keccak256("order1");
        vm.prank(parent);
        hatchLog.emitAllowanceExecuted(childId, 2500, ref);
    }

    function test_schedule_upsert_and_read() public {
        bytes32 childId = keccak256("child1");
        bytes32 hash = keccak256("policy");
        vm.prank(parent);
        schedule.upsertPolicy(childId, hash, 1_700_000_000, false);
        HATCHSchedule.PolicyView memory v = schedule.getPolicy(childId);
        assertTrue(v.exists);
        assertEq(v.policyHash, hash);
        assertEq(v.nextDueAt, 1_700_000_000);
        assertFalse(v.paused);
    }

    function test_not_upgradeable_plain_create() public view {
        assertTrue(address(hatchLog).code.length > 0);
    }
}
