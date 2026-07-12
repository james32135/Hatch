# MARKET_VERIFICATION_REPORT.md

> Generated: 2026-07-12T20:41:24.728Z
> Network: testnet
> Notional probe: $6
> Source: live SoDEX `/markets/symbols` + orderbooks + dry EIP-712 validation
> Real IOC submits: attempted (eng key present)

## Summary

| Metric | Count |
|--------|------:|
| Scanned | 32 |
| Eligible (shown in UI) | 4 |
| Unavailable | 28 |

## Eligible — Markets you can actually buy right now

| Symbol | Trading Enabled | Cancel Only | Maintenance | Gateway | Dry Price | Dry Qty | Order Accepted | Order Filled | TradeID | OrderID | Balance Updated |
|--------|:---:|:---:|:---:|:---:|---|---|:---:|:---:|---|---|:---:|
| vBTC_vUSDC | YES | NO | NO | PASS | 64516 | 0.0001 | dry-only | — | — | — | — |
| vNVDA_vUSDC | YES | NO | NO | PASS | 183.18 | 0.033 | dry-only | — | — | — | — |
| vDEFIssi_vUSDC | YES | NO | NO | PASS | 0.2074 | 29.07 | dry-only | — | — | — | — |
| vUSSI_vUSDC | YES | NO | NO | PASS | 1.2962 | 4.66 | dry-only | — | — | — | — |

## Unavailable

| Symbol | Reason | Trading Enabled | Cancel Only | Maintenance | Gateway |
|--------|--------|:---:|:---:|:---:|:---:|
| TESTBTC_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| TESTSHIB_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| TESTSOSO_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vAAPL_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vAAVE_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vADA_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vAMZN_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vAVAX_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vBNB_vUSDC | Spread too large | YES | NO | NO | PASS |
| vDOGE_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vETH_vUSDC | Spread too large | YES | NO | NO | PASS |
| vGOOGL_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vHYPE_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vLINK_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vLTC_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vMAG7ssi_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vMEMEssi_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vMETA_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vMSFT_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vSHIB_vUSDC | Spread too large | YES | NO | NO | PASS |
| vSOL_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vTSLA_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vUNI_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vUSDT_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vXAUt_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vXRP_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| vZEC_vUSDC | Empty Ask Book | YES | NO | NO | FAIL |
| WSOSO_vUSDC | Spread too large | YES | NO | NO | PASS |

## Notes

- FILLED in production requires executedQty > 0, trade history, and balance evidence.
- Parent invest path uses connected wallet only — never deployer / eng key.
- Eng key (if present) is for this verification script only.
- Spread gate: max 5% mid-spread for eligibility.
