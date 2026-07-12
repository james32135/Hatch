# SoDEX Cancel-Only Root Cause Report

Generated: 2026-07-12  
Scope: SoDEX spot, testnet rejection `symbol is in cancel only mode`  
Production code changed during investigation: **No**

## Verdict

The rejection is not caused by EIP-712, JSON field order, symbol encoding, account mapping, nonce, HTTP headers, price, quantity, tick size, relay behavior, or the connected wallet.

The proven root cause is a capability-state mismatch inside the SoDEX testnet data plane:

1. Public REST metadata exposes only `TRADING` or `HALT`.
2. The legacy metadata used by the official web client exposes `tradeSwitch`, supported order types, and supported TIF values.
3. Neither surface exposes the matcher’s additional `cancel only` state.
4. The matcher enforces that additional state during a signed new-order write.
5. HATCH treated public-read success and local payload construction as if they proved signed-write acceptance.

The exact internal switch that places a symbol in cancel-only mode is not public. What is proven is that it is separate from, and can contradict, all documented/read-visible status fields.

## Direct evidence

### Rejected order

- Time: `2026-07-12T20:48:01.293Z`
- Network: testnet
- Connected/master wallet: `0xf76e6b0920e9332ff4410f6dd53f01722abc71a3`
- SoDEX account ID: `54647`
- Symbol: `vNVDA_vUSDC`
- Symbol ID: `27`
- Client order ID: `hxmri9lzq7xir8`
- Quantity: `0.033`
- Price: `183.18`
- Payload hash: `0x507470d9c80de39b48a721975381a8d60282967ca2590399b4efd8b515ea9a91`
- HTTP status: `200`
- Gateway/application code: `-1`
- Gateway error: `symbol is in cancel only mode`
- Order ID: none
- Result: rejected before matcher order creation

The same current failure was independently recorded for:

- `vETH_vUSDC` at `2026-07-12T20:30:43.392Z`
- `vUSSI_vUSDC` at `2026-07-12T20:16:23.592Z`

### Simultaneous metadata contradiction

At the time of investigation, uncached official endpoints returned the following for `vNVDA_vUSDC`:

- REST v1 `/api/v1/spot/markets/symbols`
  - `status = TRADING`
  - symbol ID `27`
  - tick size `0.01`
  - price precision `2`
  - quantity precision `3`
  - step size `0.001`
  - minimum quantity `0.001`
  - minimum notional `5`
- Official web-client endpoint `/pro/p/symbol/list`
  - `tradeSwitch = true`
  - `supportOrderType = LIMIT,MARKET`
  - `supportTimeInForce = GTC,FOK,IOC,GTX`
- REST v1 orderbook
  - HTTP/application code `0`
  - 20 bids and 20 asks
  - best bid `182.21`
  - best ask `182.27`
- Signed order write
  - HTTP `200`
  - application code `-1`
  - `symbol is in cancel only mode`

This is a protocol contradiction, not a stale HATCH cache: direct uncached requests returned the same public metadata after the signed rejection.

## Why the 15-stage gate failed

The previous eligibility engine used misleading names for three checks:

- `gateway_accepts` passed when public metadata/orderbook HTTP calls succeeded.
- `ioc_accepted` passed when a local LIMIT+IOC payload could be constructed.
- `gatewayValidation = PASS` meant public reads plus dry serialization succeeded.

No signed order reached the gateway in those checks.

The generated verification report also said real IOC submits were “attempted” whenever `SODEX_PRIVATE_KEY` existed, but the script contained no submit call. Every row was explicitly emitted as `dry-only`.

Therefore the UI statement “Passed all 15 eligibility stages + dry validation” did not establish:

- new orders are enabled,
- the gateway accepts that symbol,
- the matcher accepts that symbol,
- IOC is enabled,
- an order can be created,
- an order can fill.

## Documented protocol limitation

The complete official documentation export contains no occurrence of `cancel only`.

The documented `Symbol.status` enum contains only:

- `TRADING`
- `HALT`

The documented websocket streams expose tickers, books, trades, account state, balances, orders, fills, and account events. They do not expose an instrument execution mode or cancel-only flag.

System maintenance is documented separately as HTTP `503`; this incident is not that condition because public services remained available and the signed write returned HTTP `200` with an application-level symbol-state rejection.

## Official UI traffic

The official testnet trading UI does not use REST v1 for its primary public market display. Captured traffic used:

- `/pro/p/symbol/list`
- `/pro/p/symbol/coins`
- `/pro/p/quotation/tickers`
- `/pro/p/quotation/ticker`
- `/pro/p/quotation/depth`
- `/pro/p/quotation/deal`
- `/pro/p/quotation/kline`
- `/biz/config/symbol?env=testnet`

The web-client symbol list also reported `vNVDA_vUSDC tradeSwitch=true`; copying that endpoint would not have prevented this rejection.

The `/biz/config/symbol?env=testnet` list is not a safe-market list. It omitted markets with proven historical accepted/fill records, including `WSOSO_vUSDC`, so membership cannot be treated as execution capability.

## Historical state proves capability changes over time

Account `54647` has official SoDEX history proving earlier successful writes:

- `WSOSO_vUSDC`: multiple accepted and filled LIMIT IOC/GTC orders; trade IDs include `1742754` through `1742757`.
- `vETH_vUSDC`: historical filled LIMIT IOC and MARKET IOC orders.
- `vSOL_vUSDC`: historical filled LIMIT IOC order.
- `vBTC_vUSDC`: historical accepted LIMIT GTC orders that were later canceled.

The same `vETH_vUSDC` symbol now returns cancel-only. A permanent symbol allowlist is therefore unsafe. Capability evidence requires a short validity period and must be invalidated immediately on any execution-mode rejection.

## Exhaustive signed testnet probe

The standalone engineering probe executed $5 and $10 variants of:

- LIMIT IOC,
- MARKET IOC,
- LIMIT GTC followed by cancellation.

Results after delayed order/trade reconciliation:

### Cancel-only on all six attempts

- `vUNI_vUSDC`
- `vAAVE_vUSDC`
- `vDEFIssi_vUSDC`
- `vNVDA_vUSDC`
- `vADA_vUSDC`
- `vUSSI_vUSDC`
- `vDOGE_vUSDC`
- `vLTC_vUSDC`
- `vMEMEssi_vUSDC`
- `vETH_vUSDC`

Every one of these symbols simultaneously reported REST `TRADING` and legacy `tradeSwitch=true`.

### Accepted by gateway and matcher on all six attempts

- `vXRP_vUSDC`
- `vTSLA_vUSDC`
- `vXAUt_vUSDC`
- `vHYPE_vUSDC`
- `vAVAX_vUSDC`
- `WSOSO_vUSDC`
- `vSOL_vUSDC`
- `vBTC_vUSDC`
- `vMAG7ssi_vUSDC`
- `vZEC_vUSDC`
- `vSHIB_vUSDC`
- `vBNB_vUSDC`

Observed fills with trade IDs and matching balance increases:

- `WSOSO_vUSDC`: 2 of 6 probe orders
- `vBTC_vUSDC`: 4 of 6
- `vSHIB_vUSDC`: 2 of 6
- `vBNB_vUSDC`: 2 of 6

The other fully accepted symbols terminated without fills, which proves submission/matcher capability but not immediate fillability at the tested price/book state.

### Order-mode-specific failures

The following accepted LIMIT modes but rejected MARKET with `MissingOraclePrice`:

- `TESTSOSO_vUSDC`
- `vAAPL_vUSDC`
- `vMETA_vUSDC`
- `TESTBTC_vUSDC`
- `vMSFT_vUSDC`
- `vAMZN_vUSDC`
- `vGOOGL_vUSDC`

`vUSDT_vUSDC` returned two distinct constraints:

- LIMIT: `only market IOC orders are allowed for this symbol`
- MARKET: `order rejected: MissingOraclePrice`

`vLINK_vUSDC` and `TESTSHIB_vUSDC` had no usable ticker/book reference for the LIMIT test constructor and were not write-probed. They remain unverified.

## Wallet and account identity

Identity was independently confirmed through REST and websocket:

- Environment/connected wallet: `0xf76e6b0920e9332ff4410f6dd53f01722abc71a3`
- REST account-state `user`: same address
- REST account-state `aid`: `54647`
- Websocket `accountState` subscription result: same address and account ID
- Websocket state payload `user`: same address
- Websocket state payload `aid`/`uid`: `54647`
- Persisted failed orders: same parent wallet

No deployer, backend, or service wallet appears in the rejected order path.

The requirement that the connected wallet must also be the on-chain gas payer for every matched trade does not match SoDEX’s signed-order architecture. The wallet authorizes the order with EIP-712; the exchange sequencer/settlement system publishes exchange state. Non-custodial ownership is established by signer/account/balance ownership, not by requiring the user address to submit every settlement transaction.

## Explorer evidence

The official explorer frontend queried:

- `GET https://clobscan-testnet.sodex.dev/api/v1/spot/account/transactions?address=<wallet>`
- ValueChain RPC `eth_call` for token balances

For the connected wallet, the spot account-transactions endpoint returned an empty array even though official SoDEX order/trade APIs contain proven fills. Explorer linkage from a SoDEX trade ID/order ID to a public transaction is therefore not currently exposed by this account endpoint.

Under the user’s strict safe-list rule requiring explorer confirmation, no testnet market can yet be certified safe until that linkage is proven.

## Root-cause classification

- Primary: undocumented matcher execution mode not represented in public symbol metadata.
- HATCH defect: dry/read checks were mislabeled as gateway and IOC acceptance.
- HATCH defect: “gateway PASS” was used as a routing prerequisite despite no signed write.
- HATCH defect: generated verification copy claimed real attempts that never occurred.
- Not causal: signature, nonce, field order, symbol ID, price, tick size, account ID, relay headers.
- Protocol/documentation defect: documented and official-web metadata can advertise trading while the matcher accepts cancels only.

## Required safety rule

Until SoDEX exposes an authoritative execution-mode endpoint, `TRADING`, `tradeSwitch`, ticker presence, book depth, and websocket presence are necessary but never sufficient.

A symbol may be called executable only when a recent signed probe proves:

1. top-level gateway code is zero,
2. per-order code is zero,
3. an order ID is returned,
4. the order appears in open/history state,
5. terminal status is known,
6. any claimed fill has a trade record and balance evidence,
7. explorer linkage is present if explorer confirmation remains mandatory.

Any `cancel only`, `HALT`, maintenance, disabled, suspended, reject-only, frozen, or unsupported response must immediately invalidate the capability record.
