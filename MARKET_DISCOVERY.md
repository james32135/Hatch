# MARKET_DISCOVERY.md

> Captured: 2026-07-12  
> Engine: `packages/backend/src/services/marketLiquidity.ts`

---

## Sources (official only)

| Input | Endpoint |
|-------|----------|
| Symbols / status / minNotional / precision | `GET /markets/symbols` |
| Volume / last | `GET /markets/tickers` |
| Depth | `GET /markets/{symbol}/orderbook?limit=20` |

---

## Per-market fields

Executable · Trading enabled · Cancel only · Maintenance · Bid/ask depth · Spread · Last · Mid · Min notional · Tick · Precision · Volume · Liquidity score · Execution score · Expected slippage · Estimated fill probability

---

## Hard skips (never submit)

| Condition | Reason label |
|-----------|--------------|
| `CANCEL_ONLY` / halt / disabled / maintenance | Cancel only / Trading disabled / Maintenance |
| `asks == 0` | Empty orderbook (asks) |
| `bids == 0` | Empty orderbook (bids) |
| Ask depth USD &lt; max(minNotional, invest notional) | Insufficient liquidity |
| Spread &gt; 25% | Spread too large |
| Non-USDC quote | Unsupported quote |
| Orderbook fetch error | Orderbook unavailable |

---

## Selection

1. Parent **must** pick a symbol from `available[]` in the UI.
2. Sign-draft requires `symbol` or `marketId`.
3. If no choice (API-only): highest `executionScore` among available — **no preferred regex**.
4. Relay re-checks the chosen symbol is still executable.

---

## MarketExecutionReport

Returned on discovery API and embedded in sign-draft:

```
scannedAt, profileId, network, notionalUsd, scanned,
available[], unavailable[{ symbol, reason, ... }], topExecutable[]
```

---

## API

`GET /api/sodex/markets/executable?notionalUsd=10`

Response includes `available`, `unavailable`, `report`, and full `markets` scan.
