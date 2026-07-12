# PROTOCOL_TRACE_V2.md

> **Captured:** 2026-07-12 (Practice / SoDEX testnet)  
> **After fix:** SoDEX price/qty serialization = reference `formatDecimal` (strip trailing zeros)  
> **Raw:** `artifacts/protocol_trace_v2_raw.json`  
> **Rule:** Continue past MAG7 non-fill; stop only on protocol `code != 0`. Wait for FILLED / CANCELED / EXPIRED.

---

## Outcome

| Path | Result |
|------|--------|
| **A — HATCH MAG7** (`vMAG7ssi_vUSDC`) | Protocol **accept** (`code: 0`, `orderID: 1274981537`) → history **CANCELED** `executedQty: 0` — **empty asks** (liquidity, not protocol) |
| **B — Liquid book** (`WSOSO_vUSDC`) | **FILLED** `orderID: 1274981550` → `tradeID: 1742757` → balances updated (vUSDC −6.003, WSOSO +13.331) |
| **Mainnet** | **Not executed** — env has testnet `SODEX_ACCOUNT_ID=54647` / eng key only; no mainnet SoDEX trading credentials in `.env` |

**Goal A proven on Practice** for the signing/relay/settlement path.  
**HATCH product MAG7 Path A** still cannot FILLED while testnet MAG7 `asks: []`.

---

## Phase 1 fix (proven defect only)

| Before | After |
|--------|-------|
| `mid.toFixed(4)` → `"0.4500"` → SoDEX `price is invalid` | `formatPrice(mid, meta)` → `"0.45"` → accept |

Implemented in:

- `packages/backend/src/services/sodexSymbols.ts` — `formatDecimal` / `formatPrice` / `formatQuantity` (sosomind-equivalent)
- `packages/backend/src/services/parentSignDraft.ts` — `sizeLimitBuy` uses `formatPrice` + strip-zero qty

---

## Attempt A — HATCH MAG7 (Practice)

### Liquidity BEFORE submit (proven)

| Field | Value |
|-------|-------|
| bestBid | `["0.45","2216.03"]` |
| bestAsk | `null` |
| askDepthLevels | `0` |
| bidDepthLevels | `2` |
| spread | `null` |
| minNotional | `5` |
| tickSize | `0.0001` |
| pricePrecision | `4` |
| quantityPrecision | `2` |
| orderType | LIMIT=`1` |
| timeInForce | IOC=`3` |

### 1. Unsigned payload

```json
{
  "type": "batchNewOrder",
  "params": {
    "accountID": 54647,
    "orders": [{
      "symbolID": 3,
      "clOrdID": "hv2A_MAG7mri6wsma",
      "side": 1,
      "type": 1,
      "timeInForce": 3,
      "price": "0.45",
      "quantity": "13.34"
    }]
  }
}
```

`price` is **`"0.45"`** (not `"0.4500"`).

### 2–3. TypedData + Signature

- Domain: `spot` / `1` / `chainId: 138565` / `verifyingContract: 0x0…0`
- Types: `ExchangeAction(payloadHash bytes32, nonce uint64)`
- Wire: `X-API-Sign = 0x01 + r/s/v(0|1)`

### 4–6. Relay / Exchange

- `POST https://testnet-gw.sodex.dev/api/v1/spot/trade/orders/batch`
- Headers: `X-API-Sign`, `X-API-Nonce` (no `X-API-Chain`)
- Response: **`code: 0`**

```json
{
  "code": 0,
  "timestamp": 1783884731421,
  "data": [{ "code": 0, "clOrdID": "hv2A_MAG7mri6wsma", "orderID": 1274981537 }]
}
```

### 7–8. IDs

- OrderID: `1274981537`
- ClientOrderID: `hv2A_MAG7mri6wsma`

### 9. Order history (polled to terminal)

```json
{
  "status": "CANCELED",
  "executedQty": "0",
  "avgPrice": "0.45",
  "tradeIds": [],
  "asksEmpty": true,
  "iocCannotFillWithoutAsks": "BUY IOC requires resting asks to match against; empty ask book → cancel/expire with executedQty=0"
}
```

### 10. Trades

No trades for `orderID=1274981537` (`tradeIds: []`).

### Why IOC cannot fill (MAG7)

Empty ask book proven. BUY IOC has no resting sell liquidity to match.  
**GTC** would rest as a bid; it would **not** fill until a seller appears.  
**Another liquid market** (WSOSO) succeeds with the same protocol (Attempt B).

---

## Attempt B — WSOSO liquid fill (Practice) — Goal A

### Liquidity BEFORE submit

| Field | Value |
|-------|-------|
| bestBid | `["0.3","6148.56"]` |
| bestAsk | `["0.45","1384.97"]` |
| askDepthLevels | `4` |
| bidDepthLevels | `20` |
| spread | `0.15` |
| minNotional | `1` |
| tickSize | `0.0001` |
| useSlip005 | `true` (sosomind market-style buffer) → limit price `"0.4523"` |

### Exchange accept

```json
{
  "code": 0,
  "data": [{ "code": 0, "clOrdID": "hv2B_WSOSOmri6ww94", "orderID": 1274981550 }]
}
```

### History → FILLED

```json
{
  "symbol": "WSOSO_vUSDC",
  "orderID": 1274981550,
  "status": "FILLED",
  "executedQty": "13.34",
  "executedValue": "6.003",
  "price": "0.4523",
  "timeInForce": "IOC",
  "type": "LIMIT"
}
```

### Trade

```json
{
  "tradeID": 1742757,
  "orderID": 1274981550,
  "symbol": "WSOSO_vUSDC",
  "side": "BUY",
  "price": "0.45",
  "quantity": "13.34",
  "fee": "0.008671",
  "feeCoin": "WSOSO"
}
```

### Balances BEFORE → AFTER

| Coin | Before | After | Delta |
|------|--------|-------|-------|
| vUSDC | 1223.48378 | 1217.48078 | **−6.003** |
| WSOSO | 38.401364 | 51.732693 | **+13.331** (qty − fee) |

### Portfolio / explorer / DB

- **Portfolio (SoDEX):** REST balances prove update; app URL `https://testnet.sodex.com/portfolio`
- **Explorer:** CLOB fill is not an EVM tx — REST tradeID is the settlement proof
- **HATCH DB:** this capture hit the gateway directly (no Prisma row). Production `/api/sodex/relay` would persist `signed_orders` after parent MetaMask sign
- **HATCH UI:** not asserted in this gateway-only capture; balances on SoDEX vault are proven. UI refresh depends on live portfolio reads of those balances

---

## Shared BEFORE/AFTER account surfaces

| Step | Status |
|------|--------|
| 11 Balances BEFORE | OK — see raw |
| 12 Balances AFTER | OK — deltas above |
| 13 Account state BEFORE | OK |
| 14 Account state AFTER | OK |
| 15 Orderbook BEFORE | MAG7 + WSOSO captured |
| 16 Orderbook AFTER | MAG7 + WSOSO captured |
| 17 Explorer | Documented (non-EVM) |
| 18 Database | Gateway-direct note |
| 19 Timeline | FILLED on WSOSO |
| 20 Final portfolio | Deltas proven |

Full poll timestamps / latencies / raw JSON: `artifacts/protocol_trace_v2_raw.json`.

---

## Reference comparison (after fix)

| Item | Same? | Evidence |
|------|-------|----------|
| Endpoint | YES | `POST …/trade/orders/batch` |
| EIP-712 domain | YES | spot/1/chainId/0x0 |
| Signature wire | YES | `0x01`+r/s/v |
| Nonce | YES | uint64 ms |
| Price formatting | YES | strip trailing zeros / tick |
| Qty formatting | YES | step + strip zeros |
| Order type / TIF | YES | LIMIT + IOC (testnet market-style) |
| Headers `X-API-Chain` | NO (remaining) | sosomind sends; HATCH omits — **non-causal** (accept+fill without it) |
| Default symbol | NO (product) | HATCH Path A = MAG7/USSI; fill proof used WSOSO where asks exist |
| Buy slip +0.5% | NO (product) | sosomind market-style uses slip; HATCH MAG7 uses mid. WSOSO proof used slip to cross ask |

**Zero remaining protocol blockers for accept+fill** when the book has asks and price is formatted correctly.  
Remaining HATCH Path A demo failure on Practice MAG7 is **empty ask liquidity**, not signature/relay.

---

## Mainnet

Not run. `.env` provides a single eng SoDEX key bound to testnet account `54647`. No mainnet SoDEX account credentials present. Mainnet fill proof requires a funded mainnet SoDEX account and explicit allow.

---

## Files changed (Phase 1)

- `packages/backend/src/services/sodexSymbols.ts`
- `packages/backend/src/services/parentSignDraft.ts`
- `packages/backend/tests/sodexFormat.test.ts` (new)
- `packages/backend/tests/parentSignDraft.test.ts`
- `packages/backend/scripts/protocol-trace-v2.mts` (new)
- `artifacts/protocol_trace_v2_raw.json`
- `PROTOCOL_TRACE_V2.md`
