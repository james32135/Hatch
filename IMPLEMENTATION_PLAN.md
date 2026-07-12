# Verified Market Capability Implementation Plan

Generated: 2026-07-12  
Status: plan only; production implementation remains blocked pending evidence review

## Objective

Replace inferred eligibility with measured, network-specific execution capability.

## Non-negotiable semantics

The following terms must have exact meanings:

- `metadataTrading`: REST v1 reports `status=TRADING`.
- `webTradeSwitch`: official browser metadata reports `tradeSwitch=true`.
- `gatewayReachable`: an HTTP request reached the signed-write endpoint.
- `gatewayAccepted`: top-level code is zero and per-order code is zero.
- `matcherAccepted`: an order ID exists and the order appears in open/history state.
- `canFill`: a probe produced a trade, or a valid terminal no-fill status proves acceptance without execution.
- `fillProven`: executed quantity is positive, at least one trade exists, and balance evidence agrees.
- `verifiedSafe`: all mandatory safe-list evidence is present and fresh.

Dry serialization must never be named accepted, gateway validated, executable, or safe.

## Capability record

Persist one record per:

- network,
- account authorization class,
- symbol ID,
- order type,
- time in force,
- notional band.

Required fields:

- symbol and display alias,
- internal ID,
- metadata status,
- legacy trade switch,
- supported order types/TIF,
- precision and filter rules,
- exact probe request without private/signature material,
- gateway HTTP status/code/error,
- per-order code/error,
- order ID,
- order status,
- trade IDs,
- executed quantity/value,
- balance before/after,
- explorer reference when available,
- observed time,
- expiry time,
- invalidation reason.

## Probe strategy

### Read layer

For every symbol:

1. Fetch REST v1 symbols without cache.
2. Fetch official web-client symbol metadata.
3. Fetch ticker.
4. Fetch orderbook.
5. Capture allTicker websocket presence.
6. Verify symbol aliases and IDs agree.
7. Validate precision, tick, step, quantity, and notional rules.

### Signed write layer

On testnet, using the same wallet/account being certified:

1. Submit LIMIT IOC at $5.
2. Submit LIMIT IOC at $10.
3. Submit MARKET IOC at $5.
4. Submit MARKET IOC at $10.
5. Submit a deliberately non-crossing LIMIT GTC at $5.
6. Submit a deliberately non-crossing LIMIT GTC at $10.
7. Cancel any accepted resting GTC order.
8. Reconcile order history, trades, and balances.

Do not use a shared service wallet to certify user execution. Capability may be venue-global, but account authorization and balances are account-specific.

### Mainnet

Repeat independently. Never copy:

- testnet IDs,
- testnet status,
- testnet capability,
- testnet order evidence,
- testnet safe-list membership.

Mainnet probes require explicit user confirmation for each financial write, sufficient funds, and existing hard caps. Do not bypass the engineering wallet’s mainnet safety guard.

## Cache and invalidation

Suggested policy:

- public metadata: 15–30 seconds,
- book/ticker: 1–3 seconds,
- positive signed capability: maximum 5 minutes on testnet; shorter on mainnet,
- negative execution-mode rejection: at least 15 minutes,
- immediate invalidation on `cancel only`, `HALT`, maintenance, disabled, suspended, frozen, reject-only, or unsupported responses,
- immediate invalidation when symbol ID or filter metadata changes.

Positive capability is not permanent. Historical ETH fills did not prevent later ETH cancel-only rejection.

## UI behavior

Until a market is verified safe:

- do not show it as buyable,
- do not label it eligible,
- do not display gateway PASS,
- do not assign a fill probability,
- show `UNVERIFIED` or the exact rejection reason.

When the verified safe list is empty:

- show no buyable markets,
- explain that the venue currently exposes no fully verified market,
- do not fall back to score ranking,
- do not route to a merely liquid market.

## Relay behavior

Before presenting a signature:

1. Require a fresh capability record for the exact network/symbol/order mode.
2. Verify wallet-to-account mapping.
3. Bind draft to network, account ID, symbol ID, exact ordered body, nonce, and notional.

Immediately before forwarding:

1. Recheck metadata for `HALT`.
2. Recheck capability expiry.
3. Reject locally if negative evidence exists.
4. Forward the user-signed bytes unchanged except canonical recovery-byte normalization.

After forwarding:

1. Parse top-level and per-order results separately.
2. Persist exact gateway error.
3. Invalidate capability on execution-mode error.
4. Poll/subscribe until matcher state is known.
5. Never report FILLED without trade and balance evidence.

## Correct misleading existing behavior

After evidence review, production changes should:

- remove or rename the false `gateway_accepts` dry/read stage,
- remove or rename the false `ioc_accepted` dry stage,
- stop emitting `gatewayValidation=PASS` from public reads,
- stop calling the read-only function a live capability probe,
- remove the generated-report claim that real IOC submits occurred,
- stop presenting ranked markets as executable without signed evidence,
- prevent routing when the verified safe list is empty.

## Explorer requirement

The current explorer account endpoint does not map the wallet’s known spot fills to explorer transactions.

Two acceptable paths:

1. Obtain and verify an official order/trade-to-block/transaction endpoint, then retain explorer confirmation as mandatory.
2. If SoDEX confirms that exchange-state blocks do not map each user order to a wallet transaction, redefine explorer evidence to the official exchange block/state commitment rather than the wallet as transaction sender.

Do not silently weaken this requirement.

## Rollout

1. Review the root-cause and protocol-diff evidence.
2. Complete and sign off the testnet execution matrix.
3. Resolve explorer linkage.
4. Generate a non-empty testnet safe list only from qualifying rows.
5. Implement capability persistence and API semantics.
6. Add regression tests for metadata-TRADING plus matcher-cancel-only contradiction.
7. Deploy testnet UI behavior.
8. Repeat mainnet verification with explicit user-approved writes.
9. Enable mainnet only after independent safe-list sign-off.

## Acceptance tests

- A symbol with `status=TRADING` and `tradeSwitch=true` but gateway cancel-only is never shown as buyable.
- A dry payload cannot produce any accepted/executable flag.
- A successful gateway result without an order-state record is not matcher accepted.
- A FILLED status without trade and balance evidence is not shown as filled.
- Testnet evidence cannot satisfy a mainnet check.
- Expired capability cannot route an order.
- Negative execution evidence invalidates prior positive evidence immediately.
- The connected wallet, REST account state, websocket account state, signed order, and resulting balance/trade history resolve to the same account.
