// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * HATCHLog — append-only audit events for allowance / child lifecycle.
 * No custody of user funds. Not upgradeable (plain CREATE deploy).
 * Emitters: any address (parent wallet is msg.sender on events).
 * Deploy on ValueChain EVM (mainnet 286623 / testnet 138565).
 */
contract HATCHLog {
    address public immutable deployer;
    uint256 public immutable deployedAt;

    event Deployed(address indexed deployer, uint256 chainId, uint256 timestamp);
    event ChildRegistered(bytes32 indexed childId, address indexed parent, uint8 ageYears);
    event AllowanceExecuted(
        bytes32 indexed childId,
        address indexed parent,
        uint256 amountUsdCents,
        bytes32 ref
    );
    event PolicyPaused(bytes32 indexed childId, address indexed parent, bool paused);

    constructor() {
        deployer = msg.sender;
        deployedAt = block.timestamp;
        emit Deployed(msg.sender, block.chainid, block.timestamp);
    }

    function emitChildRegistered(bytes32 childId, uint8 ageYears) external {
        emit ChildRegistered(childId, msg.sender, ageYears);
    }

    function emitAllowanceExecuted(bytes32 childId, uint256 amountUsdCents, bytes32 ref)
        external
    {
        emit AllowanceExecuted(childId, msg.sender, amountUsdCents, ref);
    }

    function emitPolicyPaused(bytes32 childId, bool paused) external {
        emit PolicyPaused(childId, msg.sender, paused);
    }
}
