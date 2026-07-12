# MARKET_VERIFICATION_REPORT.md

> Generated: 2026-07-12T21:52:02.509Z
> Network: testnet
> Notional probe: $6
> Source: live SoDEX `/markets/symbols` + orderbooks + dry EIP-712 + signed capability records
> Real IOC submits: not performed by this script — use `probe-sodex-market-capabilities.mts` for signed writes
> Capability seed rows: 29

## Summary

| Metric | Count |
|--------|------:|
| Scanned | 32 |
| Matcher-capable (shown in UI) | 3 |
| Unavailable | 29 |

## Matcher-capable — markets with signed evidence

| Symbol | Trading Enabled | Cancel Only | Capability | Dry Price | Dry Qty | Matcher | Fill proven | TradeIDs | OrderIDs | verifiedSafe |
|--------|:---:|:---:|:---:|---|---|:---:|:---:|---|---|:---:|
| vBTC_vUSDC | YES | NO | FILL_OK | 64242 | 0.0001 | YES | YES | 9439409,9439410 | 1274994735,1274994749 | NO |
| WSOSO_vUSDC | YES | NO | FILL_OK | 0.4523 | 13.34 | YES | YES | 1742760,1742761 | 1274996500,1274996509 | NO |
| vBNB_vUSDC | YES | NO | FILL_OK | 954.7 | 0.007 | YES | YES | 493349,493350 | 1274994962,1274995002 | NO |

## Unavailable

| Symbol | Reason | Trading Enabled | Cancel Only | Maintenance | Capability |
|--------|--------|:---:|:---:|:---:|:---:|
| TESTBTC_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| TESTSHIB_vUSDC | Empty Ask Book | YES | NO | NO | UNVERIFIED |
| TESTSOSO_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vAAPL_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vAAVE_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vADA_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vAMZN_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vAVAX_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vDEFIssi_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vDOGE_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vETH_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vGOOGL_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vHYPE_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vLINK_vUSDC | Empty Ask Book | YES | NO | NO | UNVERIFIED |
| vLTC_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vMAG7ssi_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vMEMEssi_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vMETA_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vMSFT_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vNVDA_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vSHIB_vUSDC | Dry payload failed | YES | NO | NO | FILL_OK |
| vSOL_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vTSLA_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vUNI_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vUSDT_vUSDC | Empty Ask Book | YES | NO | NO | UNVERIFIED |
| vUSSI_vUSDC | Cancel Only | YES | YES | NO | CANCEL_ONLY |
| vXAUt_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vXRP_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |
| vZEC_vUSDC | Empty Ask Book | YES | NO | NO | MATCHER_OK |

## Notes

- FILLED in production requires executedQty > 0, trade history, and balance evidence.
- `verifiedSafe` stays NO until explorer wallet transactions map to fills (GAP-5).
- This report never claims live IOC submits; signed evidence comes from capability records / probe artifact.
