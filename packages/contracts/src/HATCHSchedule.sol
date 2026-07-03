// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * HATCHSchedule — optional on-chain transparency for allowance policy hash + nextDueAt.
 * No custody. Not upgradeable. Parent is msg.sender.
 */
contract HATCHSchedule {
    address public immutable deployer;

    struct PolicyView {
        bytes32 policyHash;
        uint64 nextDueAt;
        bool paused;
        bool exists;
    }

    mapping(bytes32 => PolicyView) public policies; // childId => view

    event Deployed(address indexed deployer, uint256 chainId);
    event PolicyUpserted(
        bytes32 indexed childId,
        address indexed parent,
        bytes32 policyHash,
        uint64 nextDueAt,
        bool paused
    );

    constructor() {
        deployer = msg.sender;
        emit Deployed(msg.sender, block.chainid);
    }

    function upsertPolicy(
        bytes32 childId,
        bytes32 policyHash,
        uint64 nextDueAt,
        bool paused
    ) external {
        policies[childId] = PolicyView({
            policyHash: policyHash,
            nextDueAt: nextDueAt,
            paused: paused,
            exists: true
        });
        emit PolicyUpserted(childId, msg.sender, policyHash, nextDueAt, paused);
    }

    function getPolicy(bytes32 childId) external view returns (PolicyView memory) {
        return policies[childId];
    }
}
