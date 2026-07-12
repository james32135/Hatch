# Verified Safe Markets — Mainnet

Generated: 2026-07-12

## Safe list

**Empty.**

No mainnet spot symbol currently satisfies the required evidence chain:

- signed gateway acceptance,
- matcher order creation,
- known terminal state,
- trade or explicit terminal no-fill explanation,
- balance confirmation for fills,
- explorer confirmation.

## Why no mainnet writes were executed

- Mainnet must be verified independently from testnet.
- The connected wallet resolves to mainnet SoDEX account ID `222622`, not testnet account ID `54647`.
- Its observed mainnet spot balance was approximately `5.96 vUSDC`, insufficient for the requested $5 and $10 matrix across every market.
- The repository has an explicit engineering-wallet mainnet write cap of 1 USDC.
- Bypassing that guard would violate the existing safety control.
- Financial mainnet writes require explicit per-trade user confirmation through the wallet; no such confirmations were available in the controlled browser session.

## Read-only observations

Mainnet metadata was collected independently.

Examples demonstrating network divergence:

- `vNVDA_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.
- `vAAPL_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.
- `vGOOGL_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.
- `vMSFT_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.
- `vMETA_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.
- `vAMZN_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.
- `vTSLA_vUSDC`: REST v1 `HALT`, legacy web metadata `tradeSwitch=true`.

This independently confirms that the official web-client `tradeSwitch` field cannot override REST v1 `HALT`.

## Application rule

Mainnet must show no verified-buyable markets until user-approved mainnet probes produce the complete evidence chain.

Testnet IDs, fills, statuses, and safe-list membership must never be reused.
