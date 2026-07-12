# SoDEX Protocol Differences

Generated: 2026-07-12  
Comparison: official SDK, official browser client, protocol reference implementation, and HATCH

## Result

No byte-level difference in HATCH’s signed `vNVDA_vUSDC` request explains the cancel-only rejection.

The request passed signature recovery and payload validation and reached the symbol-state check. SoDEX returned a specific execution-mode error rather than a signature, account, nonce, schema, price, quantity, or symbol error.

The important difference is not the write envelope. It is how market capability was inferred before the write.

## Signed write comparison

### Endpoint

- Official SDK: `POST https://testnet-gw.sodex.dev/api/v1/spot/trade/orders/batch`
- HATCH: same
- Reference implementation: same spot batch endpoint

### Body order

All implementations use the official Go struct order:

1. `accountID`
2. `orders`
3. Per order:
   1. `symbolID`
   2. `clOrdID`
   3. `side`
   4. `type`
   5. `timeInForce`
   6. `price` when present
   7. `quantity` when present
   8. `funds` when present

Rejected HATCH body semantics:

- account ID `54647`
- symbol ID `27`
- side `1` / BUY
- type `1` / LIMIT
- time in force `3` / IOC
- price and quantity encoded as decimal strings

### Signing payload

All implementations hash compact JSON in this shape:

`{"type":"batchNewOrder","params":<HTTP body>}`

All use:

- domain name `spot`
- version `1`
- testnet chain ID `138565`
- zero verifying contract
- primary type `ExchangeAction`
- fields `payloadHash: bytes32` and `nonce: uint64`

### Signature wire format

All use:

- one-byte typed-signature prefix `0x01`
- 65-byte secp256k1 signature
- recovery byte normalized to `0` or `1`

HATCH additionally recovers the signer before forwarding and rejects any signer that is not the authenticated wallet or explicitly registered per-user API-key public key.

### Headers

Official SDK and HATCH both send:

- `Accept: application/json`
- `Content-Type: application/json`
- `X-API-Sign`
- `X-API-Nonce`
- `X-API-Chain: 138565`

`X-API-Key` is omitted for the master-wallet/default-key path used by the rejected order.

Browser-only headers such as `Origin`, `Referer`, `User-Agent`, `sec-fetch-*`, Cloudflare cookies, and HTTP/2 pseudo-headers are absent from the official SDK too. They are not protocol requirements for signed API writes.

### Nonce

- Official SDK: current Unix milliseconds with a process-local monotonic increment.
- HATCH: Unix-millisecond nonce supplied in the signed draft.
- Rejected request: accepted far enough to return a symbol execution-mode error.

A bad or reused nonce would produce a nonce error, not `symbol is in cancel only mode`.

### Symbol encoding

- Body uses numeric `symbolID`, not the display symbol.
- HATCH used symbol ID `27`.
- Uncached testnet REST v1 metadata also mapped `vNVDA_vUSDC` to ID `27`.
- Official browser legacy metadata also mapped `vNVDA_vUSDC` to ID `27`.

There is no alias mismatch in this rejection.

### Account mapping

- HATCH request account ID: `54647`
- REST account state for connected wallet: `aid=54647`
- Websocket account state for connected wallet: `accountID=54647`

There is no account mismatch.

## Public-read differences

### HATCH

HATCH uses documented REST v1:

- `/api/v1/spot/markets/symbols`
- `/api/v1/spot/markets/tickers`
- `/api/v1/spot/markets/{symbol}/orderbook`

It caches symbol metadata for 60 seconds and books for a few seconds.

### Official web client

Captured browser traffic used legacy/public product endpoints:

- `/pro/p/symbol/list`
- `/pro/p/symbol/coins`
- `/pro/p/quotation/tickers`
- `/pro/p/quotation/ticker`
- `/pro/p/quotation/depth`
- `/pro/p/quotation/deal`
- `/pro/p/quotation/kline`
- `/biz/config/symbol?env=testnet`

The official web client sends normal browser CORS headers and receives Cloudflare cookies. Those headers/cookies affect browser delivery, not EIP-712 write authorization.

### Capability fields

Documented REST v1 exposes:

- `status`: only `TRADING` or `HALT`
- precision, tick, quantity, and notional rules

Official web-client metadata exposes:

- `tradeSwitch`
- `supportOrderType`
- `supportTimeInForce`

Neither exposes cancel-only.

For `vNVDA_vUSDC`, both sources claimed trading support while the signed matcher write rejected the symbol as cancel-only.

## Reference protocol behavior

The independently studied protocol implementation has no hidden cancel-only endpoint.

Its capability stack is:

1. read `/markets/symbols.status`,
2. normalize or substring-match non-trading status names,
3. block known non-trading values before signing,
4. submit when metadata allows,
5. inspect top-level/per-order error text after a signed write,
6. classify `/cancel.?only|cancel_only|not.?trading|halt/i` as non-trading.

This confirms that signed-write rejection is the fallback source of truth when metadata is stale or incomplete.

Material behavioral differences:

- The reference implementation converts cancel-only gateway text into an explicit capability failure after submit.
- HATCH persisted and displayed the rejection but continued to depend on its incorrect pre-submit “gateway PASS” model.
- The reference implementation avoids pure MARKET on testnet because of observed `MissingOraclePrice`.
- HATCH’s production allowance path also uses LIMIT IOC, but the new engineering probe proved that official metadata’s MARKET support claim is not sufficient.
- Both implementations use REST reconciliation; neither application relies on native SoDEX websocket instrument status because no such status channel exists.

## False equivalences in HATCH

The following names did not match their actual behavior:

- `gateway_accepts`: tested public orderbook reachability.
- `ioc_accepted`: tested local LIMIT+IOC payload construction.
- `gatewayValidation=PASS`: combined public-read success and dry serialization.
- `liveCapabilityProbe`: performed no signed capability write.
- verification report “real IOC submits attempted”: no submit logic existed.

These naming errors converted weak evidence into a routing guarantee.

## Protocol map

### Market discovery

1. Fetch symbol/rule metadata.
2. Map internal symbol name to numeric symbol ID.
3. Fetch ticker and book data.
4. Treat public status and book data as descriptive only.
5. Obtain signed-write capability separately.

### Account mapping

1. Wallet address identifies the SoDEX master account.
2. `/accounts/{address}/state` returns `aid`.
3. Trading body carries `accountID=aid`.
4. Signed action binds the exact body hash and nonce.
5. Gateway recovers the signer and resolves master/default or named API-key authority.

### Order lifecycle

1. Client builds ordered JSON parameters.
2. Client hashes `{type,params}`.
3. Wallet/API key signs EIP-712 `ExchangeAction`.
4. Client sends body plus signed headers.
5. Gateway authenticates signer, nonce, account, schema, and symbol execution mode.
6. On acceptance, response returns an order ID.
7. Matcher emits order state through REST/WebSocket.
8. Trades emit trade IDs and update balances.
9. Exchange state is published/settled through the SoDEX/ValueChain system.

### IOC

- LIMIT IOC requires price and quantity.
- MARKET requires IOC and either quantity or funds; market buy may use funds.
- Unfilled IOC remainder terminates immediately.
- Local construction cannot establish IOC acceptance.

### LIMIT GTC

- Accepted order remains open until fill or cancellation.
- A capability probe can submit a deliberately non-crossing GTC order and cancel it.
- Acceptance still spends order quota and briefly locks quote balance.

### MARKET

- MARKET uses TIF IOC.
- Market buy can use `funds`.
- Book presence does not prove the symbol accepts new orders.

### Balance and order synchronization

- REST state is the authoritative initialization/reconciliation path.
- `accountState` websocket returns wallet, account ID, balances, and open orders.
- `accountUpdate`, `accountOrderUpdate`, and `accountTrade` provide incremental changes.
- REST history remains necessary after websocket gaps or reconnects.

## Mainnet is independent

Mainnet does not share testnet IDs or capability:

- Connected wallet mainnet account ID: `222622`
- Connected wallet testnet account ID: `54647`
- Mainnet `vNVDA_vUSDC` ID: `29`
- Testnet `vNVDA_vUSDC` ID: `27`
- Mainnet currently reports `vNVDA_vUSDC status=HALT`
- Testnet reports `vNVDA_vUSDC status=TRADING` while matcher rejects new orders as cancel-only

No testnet capability record may be reused on mainnet.
