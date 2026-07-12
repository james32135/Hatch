# SoDEX Market Capability Matrix — Testnet

Generated from signed probe: 2026-07-12T21:19:47.501Z
Network: testnet (chain 138565)
Probe mode: REAL_SIGNED_TESTNET_WRITES

Each market was tested with $5 and $10 LIMIT IOC, MARKET IOC, and LIMIT GTC. Accepted resting GTC orders were canceled. Exact requests, order IDs, trade IDs, balances, and gateway responses are retained in `MARKET_PROBE_TESTNET.json`.

## Execution matrix

| Symbol | ID | REST status | Web switch | WS ticker | Can relay | Gateway accepted | Matcher accepted | Can fill | Modes accepted | Terminal states | Reason |
|---|---:|---|:---:|:---:|---|---|---|---|---|---|---|
| vXRP_vUSDC | 8 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vUNI_vUSDC | 15 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vLINK_vUSDC | 5 | TRADING | YES | YES | NOT RUN | NOT RUN | NOT RUN | NO | LIMIT_IOC:0/0, MARKET_IOC:0/0, LIMIT_GTC:0/0 | none | none |
| vAAVE_vUSDC | 16 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vTSLA_vUSDC | 26 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vDEFIssi_vUSDC | 22 | TRADING | YES | NO | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vNVDA_vUSDC | 27 | TRADING | YES | NO | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vXAUt_vUSDC | 11 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vHYPE_vUSDC | 17 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vADA_vUSDC | 10 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vUSSI_vUSDC | 24 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vDOGE_vUSDC | 7 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| TESTSOSO_vUSDC | 19 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| vUSDT_vUSDC | 25 | TRADING | YES | NO | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | only market IOC orders are allowed for this symbol; order rejected: MissingOraclePrice |
| vAVAX_vUSDC | 21 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vAAPL_vUSDC | 28 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| vMETA_vUSDC | 29 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| TESTBTC_vUSDC | 18 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| WSOSO_vUSDC | 4 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | YES (2/6; balance 2/2) | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | FILLED, CANCELED | terminal CANCELED with no fill |
| vSOL_vUSDC | 6 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vBTC_vUSDC | 1 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | YES (4/6; balance 4/4) | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | FILLED, CANCELED | none |
| TESTSHIB_vUSDC | 20 | TRADING | YES | NO | NOT RUN | NOT RUN | NOT RUN | NO | LIMIT_IOC:0/0, MARKET_IOC:0/0, LIMIT_GTC:0/0 | none | none |
| vMSFT_vUSDC | 32 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| vLTC_vUSDC | 13 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vAMZN_vUSDC | 31 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| vMAG7ssi_vUSDC | 3 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vMEMEssi_vUSDC | 23 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vETH_vUSDC | 2 | TRADING | YES | YES | YES (6/6) | NO (0/6) | NO (0/6) | NO | LIMIT_IOC:0/2, MARKET_IOC:0/2, LIMIT_GTC:0/2 | none | symbol is in cancel only mode |
| vZEC_vUSDC | 12 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill |
| vGOOGL_vUSDC | 30 | TRADING | YES | NO | YES (6/6) | PARTIAL (4/6) | PARTIAL (4/6) | NO | LIMIT_IOC:2/2, MARKET_IOC:0/2, LIMIT_GTC:2/2 | CANCELED | terminal CANCELED with no fill; order rejected: MissingOraclePrice |
| vSHIB_vUSDC | 14 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | YES (2/6; balance 2/2) | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | FILLED, CANCELED | terminal CANCELED with no fill |
| vBNB_vUSDC | 9 | TRADING | YES | YES | YES (6/6) | YES (6/6) | YES (6/6) | YES (2/6; balance 2/2) | LIMIT_IOC:2/2, MARKET_IOC:2/2, LIMIT_GTC:2/2 | FILLED, CANCELED | terminal CANCELED with no fill |

## Metadata and filter matrix

| Symbol | Order types | TIF | Tick | Price precision | Quantity precision | Step | Min quantity | Market min quantity | Min notional | Best bid | Best ask |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| vXRP_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 1 | 0.1 | 0.1 | 0.1 | 5 | — | — |
| vUNI_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.001 | 3 | 2 | 0.01 | 0.01 | 0.01 | 5 | 5.8 | — |
| vLINK_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.001 | 3 | 1 | 0.1 | 0.1 | 0.1 | 5 | — | — |
| vAAVE_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 110 | — |
| vTSLA_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 385.41 | — |
| vDEFIssi_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 2 | 0.01 | 0.01 | 0.01 | 5 | 0.2058 | 0.2064 |
| vNVDA_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 182.21 | 182.27 |
| vXAUt_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.1 | 1 | 4 | 0.0001 | 0.0001 | 0.0001 | 5 | 3809.9 | — |
| vHYPE_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.001 | 3 | 2 | 0.01 | 0.01 | 0.01 | 5 | 19.55 | — |
| vADA_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.00001 | 5 | 1 | 0.1 | 0.1 | 0.1 | 5 | 0.41475 | — |
| vUSSI_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 2 | 0.01 | 0.01 | 0.01 | 5 | 1.2897 | 1.2898 |
| vDOGE_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.00001 | 5 | 0 | 1 | 1 | 1 | 5 | 0.08459 | — |
| TESTSOSO_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 2 | 0.01 | 0.01 | 0.01 | 5 | 0.85 | — |
| vUSDT_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.00001 | 5 | 2 | 0.01 | 0.01 | 0.01 | 5 | 0.998 | — |
| vAVAX_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 2 | 0.01 | 0.01 | 0.01 | 5 | 9.39 | — |
| vAAPL_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 313.57 | — |
| vMETA_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 0.85 | — |
| TESTBTC_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 1 | 0 | 5 | 0.00001 | 0.00001 | 0.00001 | 5 | 1 | — |
| WSOSO_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 2 | 0.01 | 0.01 | 0.01 | 1 | 0.3 | 0.45 |
| vSOL_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 77 | — |
| vBTC_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 1 | 0 | 5 | 0.00001 | 0.00001 | 0.00001 | 5 | 64208 | 64209 |
| TESTSHIB_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.00000001 | 8 | 0 | 1 | 1 | 1 | 5 | — | — |
| vMSFT_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 0.85 | — |
| vLTC_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 60 | — |
| vAMZN_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 0.85 | — |
| vMAG7ssi_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 2 | 0.01 | 0.01 | 0.01 | 5 | 0.45 | — |
| vMEMEssi_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.0001 | 4 | 2 | 0.01 | 0.01 | 0.01 | 5 | 0.2195 | — |
| vETH_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.1 | 1 | 4 | 0.0001 | 0.0001 | 0.0001 | 5 | 2068.7 | 2400.3 |
| vZEC_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | — | — |
| vGOOGL_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.01 | 2 | 3 | 0.001 | 0.001 | 0.001 | 5 | 0.85 | — |
| vSHIB_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.00000001 | 8 | 0 | 1 | 1 | 1 | 5 | 0.0000035 | 0.000008 |
| vBNB_vUSDC | LIMIT,MARKET | GTC,FOK,IOC,GTX | 0.1 | 1 | 3 | 0.001 | 0.001 | 0.001 | 5 | 550 | 950 |

## Interpretation

- `Can relay` means a signed request reached the SoDEX write endpoint and received an HTTP response.
- `Gateway accepted` requires top-level code zero, per-order success, and an order ID.
- `Matcher accepted` requires the returned order to appear in official open/history state.
- `Can fill` requires at least one official trade ID; balance evidence is shown separately.
- REST `TRADING`, web `tradeSwitch`, book depth, and websocket presence are descriptive only.
- Explorer account transaction count for this wallet was 0; strict explorer-confirmed safe-list status is therefore not established.

