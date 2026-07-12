# Verified Safe Markets — Testnet

Generated: 2026-07-12T21:19:47.501Z

## Safe list

**Empty.**

A market qualifies only when gateway acceptance, matcher acceptance, terminal-state reconciliation, fill evidence, and explorer confirmation all pass.

## Execution-capable but not fully safe

- vXRP_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vTSLA_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vXAUt_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vHYPE_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vAVAX_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- WSOSO_vUSDC: gateway 6/6, matcher 6/6, fills 2/6, balance-proven fills 2/2. Blocked from safe list because explorer confirmation is absent.
- vSOL_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vBTC_vUSDC: gateway 6/6, matcher 6/6, fills 4/6, balance-proven fills 4/4. Blocked from safe list because explorer confirmation is absent.
- vMAG7ssi_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vZEC_vUSDC: gateway 6/6, matcher 6/6, fills 0/6, balance-proven fills 0/0. Blocked from safe list because explorer confirmation is absent.
- vSHIB_vUSDC: gateway 6/6, matcher 6/6, fills 2/6, balance-proven fills 2/2. Blocked from safe list because explorer confirmation is absent.
- vBNB_vUSDC: gateway 6/6, matcher 6/6, fills 2/6, balance-proven fills 2/2. Blocked from safe list because explorer confirmation is absent.

## Rejected or incompletely verified

- vUNI_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vLINK_vUSDC: gateway 0/0, matcher 0/0; terminal state incomplete.
- vAAVE_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vDEFIssi_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vNVDA_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vADA_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vUSSI_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vDOGE_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- TESTSOSO_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.
- vUSDT_vUSDC: gateway 0/6, matcher 0/6; only market IOC orders are allowed for this symbol; order rejected: MissingOraclePrice.
- vAAPL_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.
- vMETA_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.
- TESTBTC_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.
- TESTSHIB_vUSDC: gateway 0/0, matcher 0/0; terminal state incomplete.
- vMSFT_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.
- vLTC_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vAMZN_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.
- vMEMEssi_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vETH_vUSDC: gateway 0/6, matcher 0/6; symbol is in cancel only mode.
- vGOOGL_vUSDC: gateway 4/6, matcher 4/6; terminal CANCELED with no fill; order rejected: MissingOraclePrice.

## Explorer blocker

Official endpoint: https://clobscan-testnet.sodex.dev/api/v1/spot/account/transactions?address=0xf76e6b0920e9332ff4410f6dd53f01722abc71a3

Observed account transaction rows: 0

Official SoDEX order/trade APIs contain fills for this wallet, but the explorer account endpoint does not expose their transaction linkage. Under the required strict criteria, the application must show no verified-safe testnet markets until that linkage is proven.

