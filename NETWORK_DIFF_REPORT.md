# Official UI vs HATCH Network Diff

Generated: 2026-07-12  
Capture target: official SoDEX testnet trading UI and explorer

## Capture scope

Captured from:

- Official testnet spot page
- Official testnet explorer
- Official REST v1
- Official websocket v1
- HATCH persisted relay evidence

The controlled official-browser session was not connected to the user’s wallet, so it did not produce an official-UI signed order write. Signed-write bytes were instead compared against the official Go SDK and HATCH’s actual rejected gateway request.

## Official trading UI requests

The browser loaded market configuration through:

- `GET https://testnet-gw.sodex.dev/pro/p/symbol/list`
- `GET https://testnet-gw.sodex.dev/pro/p/symbol/coins`
- `GET https://testnet-gw.sodex.dev/pro/p/quotation/tickers`
- `GET https://testnet-gw.sodex.dev/pro/p/quotation/ticker?symbol=...`
- `GET https://testnet-gw.sodex.dev/pro/p/quotation/depth?symbol=...`
- `GET https://testnet-gw.sodex.dev/pro/p/quotation/deal?symbol=...`
- `GET https://testnet-gw.sodex.dev/pro/p/quotation/kline?...`
- `GET https://testnet.sodex.dev/biz/config/symbol?env=testnet`

It also loaded futures metadata, coin logos, announcements, region checks, wallet/auth configuration, analytics, and support resources.

## HATCH public requests

HATCH uses documented REST v1:

- `GET /api/v1/spot/markets/symbols`
- `GET /api/v1/spot/markets/tickers`
- `GET /api/v1/spot/markets/{symbol}/orderbook`
- `GET /api/v1/spot/accounts/{wallet}/state`
- `GET /api/v1/spot/accounts/{wallet}/balances`
- `GET /api/v1/spot/accounts/{wallet}/orders`
- `GET /api/v1/spot/accounts/{wallet}/orders/history`
- `GET /api/v1/spot/accounts/{wallet}/trades`

## Market status diff

For `vNVDA_vUSDC`:

- Official browser endpoint:
  - `id=27`
  - `tradeSwitch=true`
  - `supportOrderType=LIMIT,MARKET`
  - `supportTimeInForce=GTC,FOK,IOC,GTX`
- REST v1:
  - `id=27`
  - `status=TRADING`
- HATCH signed write:
  - HTTP `200`
  - code `-1`
  - error `symbol is in cancel only mode`

The official browser’s alternative metadata endpoint does not reveal the missing state.

## Browser header diff

Official browser reads include:

- `Origin: https://testnet.sodex.com`
- `Referer: https://testnet.sodex.com/`
- browser `User-Agent`
- `Accept-Language`
- `sec-fetch-*`
- Cloudflare response cookies

HATCH server reads send only the protocol-relevant `Accept` header.

These browser headers are not required by the official SDK and are not used in EIP-712 authentication. They do not explain cancel-only.

## Signed write diff

HATCH and the official SDK align on:

- method `POST`
- path `/api/v1/spot/trade/orders/batch`
- compact JSON
- body field order
- numeric symbol ID
- numeric account ID
- decimal strings
- `batchNewOrder` action name
- EIP-712 domain
- nonce format
- typed-signature prefix
- normalized recovery byte
- `Accept`
- `Content-Type`
- `X-API-Sign`
- `X-API-Nonce`
- `X-API-Chain`
- optional omission of `X-API-Key`

No hidden cookie, browser origin, referrer, or user agent is present in the official SDK’s authenticated client.

## Websocket capture

Endpoint:

`wss://testnet-gw.sodex.dev/ws/spot`

An `allTicker` subscription succeeded and returned a live snapshot. It contained price/book statistics but no instrument status or execution-mode field.

An `accountState` subscription for the connected wallet succeeded:

- wallet `0xf76e6b0920e9332ff4410f6dd53f01722abc71a3`
- account ID `54647`
- matching state payload `user`, `aid`, and `uid`

The account stream proves identity and synchronization. It does not expose whether a symbol accepts new orders.

## Explorer capture

The official explorer used:

- `GET https://clobscan-testnet.sodex.dev/api/v1/perps/account/transactions?address=...`
- analogous spot account transaction endpoint
- ValueChain RPC `eth_call` to retrieve tradable-token balances

The spot account-transactions endpoint returned no rows for the connected wallet even though SoDEX REST trade history contains fills. This prevents a verified order/trade-to-explorer mapping with the currently exposed endpoint.

## Announcement/changelog evidence

The official testnet announcement feed contains repeated network upgrades. The latest captured completion notice states that the June 5, 2026 upgrade completed and all services were restored.

There is no current announcement describing symbol-level cancel-only state, and the official documentation export contains no cancel-only term.

## Explained differences

- Different read endpoints: product implementation choice; both currently advertise NVDA as tradable.
- Browser headers/cookies: browser delivery/CORS; not signed-write authorization.
- HATCH cache: can add delay, but direct uncached metadata also contradicted the matcher.
- Websocket omission: websocket schema has no instrument execution-state field.
- Explorer account emptiness: explorer does not currently provide the required wallet/order/trade linkage.
- Signed-write bytes: materially aligned; not the rejection cause.

## Missing capture

An official-UI signed order request from the same connected wallet was not captured because the controlled browser session had no wallet connection. Reproducing that write would require the user to connect and approve in that browser session.

This missing capture does not block the current root-cause finding: HATCH’s request matches the official SDK, the signature was accepted, and SoDEX returned an explicit symbol execution-mode rejection.
