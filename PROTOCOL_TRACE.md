# PROTOCOL_TRACE.md

> **Mode:** Evidence only. No product fix in this document.  
> **Captured:** 2026-07-12T19:23:26.162Z → 2026-07-12T19:23:28.762Z (UTC)  
> **Wallet:** `0xf76e6b0920e9332ff4410f6dd53f01722abc71a3`  
> **Account ID:** `54647`  
> **Chain ID:** `138565` (SoDEX testnet / ValueChain)  
> **Gateway:** `https://testnet-gw.sodex.dev/api/v1/spot`  
> **Investment shape:** HATCH Balanced $6 → minNotional collapse → single MAG7 LIMIT IOC buy  
> **Raw dump:** `artifacts/protocol_trace_raw.json`  
> **Rule applied:** If any numbered investment step fails → **STOP**. Do not continue that attempt.

---

## Verdict (proven for this attempt only)

**This complete HATCH-shaped investment attempt never entered the matching engine.**

| Stage | Result |
|-------|--------|
| Orderbook BEFORE | OK — `asks: []`, bids present |
| Unsigned + EIP-712 sign | OK |
| Relay HTTP | HTTP 200 |
| Exchange JSON | **FAIL** — `code: -1`, `error: "price is invalid"` |
| Order IDs / history / trades / AFTER book | **NOT REACHED** |

**Proven reject cause (not inferred):** HATCH priced the leg as `"0.4500"` via `mid.toFixed(4)`. SoDEX testnet rejects that string. Identical numeric price `"0.45"` is accepted (appendix A/B). Empty asks are **not** the failure mode for *this* attempt because no `orderID` was returned.

---

## STOP point

```
Step 5 — exchange_response_JSON
Timestamp: 2026-07-12T19:23:28.762Z
Status: FAIL
Latency of prior HTTP: 389ms
Raw JSON:
{
  "code": -1,
  "timestamp": 1783884207644,
  "error": "price is invalid"
}
```

**Why stop:** Exchange top-level `code !== 0`. No `data[]` legs. No `orderID`. Steps 6–18 of the investment attempt are unreachable and are marked **NOT EXECUTED**.

---

## Stage evidence (investment attempt)

### 13. Orderbook BEFORE submit

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:27.354Z` |
| Latency | `1192ms` |
| Status | `ok` (HTTP 200, SoDEX `code: 0`) |
| HTTP request | `GET https://testnet-gw.sodex.dev/api/v1/spot/markets/vMAG7ssi_vUSDC/orderbook?limit=20` |
| HTTP response status | `200` |

Raw JSON:

```json
{
  "code": 0,
  "timestamp": 1783884206282,
  "data": {
    "blockTime": 1783884206205,
    "blockHeight": 185349290,
    "updateID": 884419582,
    "bids": [
      ["0.45", "2216.03"],
      ["0.4057", "334.81"]
    ],
    "asks": []
  }
}
```

---

### 11. GET balances (BEFORE)

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:27.688Z` |
| Latency | `334ms` |
| Status | `ok` |
| HTTP request | `GET .../accounts/0xf76e6b0920e9332ff4410f6dd53f01722abc71a3/balances` |
| HTTP response status | `200` |

Raw JSON (balances only):

```json
{
  "code": 0,
  "timestamp": 1783884206622,
  "data": {
    "blockTime": 1783884206572,
    "blockHeight": 185349293,
    "balances": [
      { "id": 0, "coin": "vUSDC", "total": "1223.48378", "locked": "0" },
      { "id": 2, "coin": "vETH", "total": "0.019087585", "locked": "0" },
      { "id": 4, "coin": "WSOSO", "total": "38.401364", "locked": "0" },
      { "id": 6, "coin": "vSOL", "total": "0.0359766", "locked": "0" }
    ]
  }
}
```

**Proven:** No `vMAG7.ssi` / `vUSSI` balance before submit.

---

### 12. GET account state (BEFORE)

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.003Z` |
| Latency | `315ms` |
| Status | `ok` |
| HTTP request | `GET .../accounts/0xf76e6b0920e9332ff4410f6dd53f01722abc71a3/state` |
| HTTP response status | `200` |

Raw JSON (truncated structure preserved):

```json
{
  "code": 0,
  "timestamp": 1783884206961,
  "data": {
    "user": "0xf76e6b0920e9332ff4410f6dd53f01722abc71a3",
    "aid": 54647,
    "uid": 54647,
    "B": [
      { "i": 0, "a": "vUSDC", "t": "1223.48378", "l": "0" },
      { "i": 2, "a": "vETH", "t": "0.019087585", "l": "0" },
      { "i": 4, "a": "WSOSO", "t": "38.401364", "l": "0" },
      { "i": 6, "a": "vSOL", "t": "0.0359766", "l": "0" }
    ],
    "O": null,
    "TO": null
  }
}
```

---

### Ticker used for HATCH mid (supporting)

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.352Z` |
| Latency | `349ms` |
| Status | `ok` |
| Note | `lastPx=0.45 bidPx=0.45 askPx=0 askSz=0` |

Raw ticker object used:

```json
{
  "symbol": "vMAG7ssi_vUSDC",
  "lastPx": "0.45",
  "askPx": "0",
  "askSz": "0",
  "bidPx": "0.45",
  "bidSz": "2216.03"
}
```

---

### 1. Unsigned payload

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.354Z` |
| Latency | `0ms` (local) |
| Status | `info` |
| HTTP | N/A — local EIP-712 construction matching HATCH `parentSignDraft` shape |

Raw unsigned construction:

```json
{
  "envelope": {
    "type": "batchNewOrder",
    "params": {
      "accountID": 54647,
      "orders": [
        {
          "symbolID": 3,
          "clOrdID": "hmtracemri6lkgx",
          "side": 1,
          "type": 1,
          "timeInForce": 3,
          "price": "0.4500",
          "quantity": "13.34"
        }
      ]
    }
  },
  "envelopeJson": "{\"type\":\"batchNewOrder\",\"params\":{\"accountID\":54647,\"orders\":[{\"symbolID\":3,\"clOrdID\":\"hmtracemri6lkgx\",\"side\":1,\"type\":1,\"timeInForce\":3,\"price\":\"0.4500\",\"quantity\":\"13.34\"}]}}",
  "payloadHash": "0x8af0f3aa8e4804ffb4bcf78f004e254892de8985f58c11a629645623b6f770b7",
  "nonce": "1783884208354",
  "domain": {
    "name": "spot",
    "version": "1",
    "chainId": 138565,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "primaryType": "ExchangeAction",
  "message": {
    "payloadHash": "0x8af0f3aa8e4804ffb4bcf78f004e254892de8985f58c11a629645623b6f770b7",
    "nonce": "1783884208354"
  },
  "hatchSizing": {
    "notionalUsd": 6,
    "mid": 0.45,
    "price": "0.4500",
    "quantity": "13.34",
    "symbolID": 3,
    "symbol": "vMAG7ssi_vUSDC",
    "type": "LIMIT=1",
    "timeInForce": "IOC=3",
    "asksBeforeCount": 0,
    "bidsBeforeCount": 2
  }
}
```

**HATCH source of `"0.4500"`:** `packages/backend/src/services/parentSignDraft.ts` → `price: mid.toFixed(4)`.

---

### 2. Signed EIP-712 payload

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.373Z` |
| Latency | `3ms` |
| Status | `ok` |
| Signer | `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3` |

Raw JSON:

```json
{
  "rawSig": "0xccf004f2bb49db76e986b120912d3e12bbc66ce1c5a6ccc568c47e54449bbc3e125c162f5319b4834e267b21b0f879e9a4a4c1b1d036d8970779f1c8490a27001c",
  "apiSign": "0x01ccf004f2bb49db76e986b120912d3e12bbc66ce1c5a6ccc568c47e54449bbc3e125c162f5319b4834e267b21b0f879e9a4a4c1b1d036d8970779f1c8490a270001",
  "signer": "0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3",
  "payloadHash": "0x8af0f3aa8e4804ffb4bcf78f004e254892de8985f58c11a629645623b6f770b7",
  "nonce": "1783884208354"
}
```

Wire format proven: `X-API-Sign = 0x01 + r/s/v` with `v ∈ {0,1}`.

---

### 3. Relay request (HATCH headers)

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.373Z` |
| Status | `info` |
| HTTP method | `POST` |
| URL | `https://testnet-gw.sodex.dev/api/v1/spot/trade/orders/batch` |

Headers sent (HATCH `SodexClient.relay` shape):

```json
{
  "accept": "application/json",
  "content-type": "application/json",
  "X-API-Sign": "0x01ccf004f2bb49db…",
  "X-API-Nonce": "1783884208354"
}
```

**Proven absence:** no `X-API-Chain` header (matches HATCH `packages/backend/src/clients/sodex.ts`).

Body:

```json
{
  "accountID": 54647,
  "orders": [
    {
      "symbolID": 3,
      "clOrdID": "hmtracemri6lkgx",
      "side": 1,
      "type": 1,
      "timeInForce": 3,
      "price": "0.4500",
      "quantity": "13.34"
    }
  ]
}
```

---

### 4. Relay response (HTTP)

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.762Z` |
| Latency | `389ms` |
| Status | `ok` at HTTP layer (`200`) |
| HTTP response status | `200` |

Response headers (selected):

```json
{
  "content-type": "application/json; charset=utf-8",
  "date": "Sun, 12 Jul 2026 19:23:27 GMT",
  "server": "cloudflare",
  "cf-ray": "a1a26c28ff9ce1c9-MRS",
  "x-ratelimit-limit": "6000",
  "x-ratelimit-remaining": "5732"
}
```

Raw body text:

```text
{"code":-1,"timestamp":1783884207644,"error":"price is invalid"}
```

---

### 5. Exchange response JSON — **FAIL / STOP**

| Field | Value |
|-------|-------|
| Timestamp | `2026-07-12T19:23:28.762Z` |
| Status | `fail` |
| Stop | `true` |

```json
{
  "code": -1,
  "timestamp": 1783884207644,
  "error": "price is invalid"
}
```

---

### 6. Batch leg responses

**NOT EXECUTED** — no `data[]` array because top `code: -1`.

---

### 7. Returned Order IDs

**NOT EXECUTED** — no `orderID`.

---

### 8. Returned Client Order IDs

**NOT EXECUTED** as exchange returns. Locally generated only: `hmtracemri6lkgx` (never accepted).

---

### 9. GET orders/history

**NOT EXECUTED** for this attempt (no orderID to match). Stop rule forbids continuing the investment timeline.

---

### 10. GET trades

**NOT EXECUTED** for this attempt.

---

### 11. GET balances (AFTER)

**NOT EXECUTED** for this attempt.

---

### 12. GET account state (AFTER)

**NOT EXECUTED** for this attempt.

---

### 14. Orderbook AFTER submit

**NOT EXECUTED** for this attempt (order never accepted).

---

### 15. Explorer records

**NOT EXECUTED** for this attempt (no CLOB orderID / no fill).  
Note: SoDEX spot matches are not EVM txs; explorer would be N/A even on fill.

---

### 16. Database rows

**NOT EXECUTED** — this capture called the SoDEX gateway directly with HATCH-identical body+headers (eng key). No HATCH Prisma `signed_orders` row. Gateway reject means production relay would also store a failed/rejected outcome if wired to persist this response.

---

### 17. Timeline events

**Investment attempt timeline (complete):**

| t (UTC) | Event |
|---------|-------|
| 19:23:26.162Z | trace_meta |
| 19:23:27.354Z | orderbook BEFORE (`asks: []`) |
| 19:23:27.688Z | balances BEFORE |
| 19:23:28.003Z | account state BEFORE |
| 19:23:28.352Z | ticker mid=`0.45` |
| 19:23:28.354Z | unsigned payload `price="0.4500"` |
| 19:23:28.373Z | EIP-712 signed |
| 19:23:28.373Z | relay POST |
| 19:23:28.762Z | **STOP** `price is invalid` |

---

### 18. Backend logs

Capture path: local script `packages/backend/scripts/protocol-trace.mts` (HATCH payload/header parity), not Render API process logs.

Console evidence:

```text
[0] INFO trace_meta (0ms)
[13] OK orderbook_BEFORE_vMAG7ssi_vUSDC (1192ms)
[11] OK balances_BEFORE (334ms)
[12] OK account_state_BEFORE (315ms)
[0] OK ticker_vMAG7ssi_vUSDC (349ms)
[1] INFO unsigned_payload (0ms)
[2] OK signed_eip712 (3ms)
[3] INFO relay_request_HATCH_headers (0ms)
[4] OK relay_response_HTTP (389ms)
[5] FAIL exchange_response_JSON (0ms)
STOP: topCode=-1 timestamp=1783884207644
Wrote D:\route\HATCH\artifacts\protocol_trace_raw.json
```

---

## Appendix A — Why `"price is invalid"` (diagnostics AFTER STOP)

These are **not** a continuation of the investment claim. They isolate the reject string.

### A1. Live symbol meta for `symbolID=3`

```json
{
  "id": 3,
  "name": "vMAG7ssi_vUSDC",
  "tickSize": "0.0001",
  "pricePrecision": 4,
  "stepSize": "0.01",
  "quantityPrecision": 2,
  "minNotional": "5",
  "buyLimitUpRatio": "5",
  "status": "TRADING"
}
```

### A2. Same wallet, same endpoint, price-string A/B

| price string | `X-API-Chain` | Exchange `code` | Result |
|--------------|---------------|-----------------|--------|
| `"0.4500"` (HATCH `toFixed(4)`) | no | `-1` | `price is invalid` (primary + retest) |
| `"0.450"` | no | `-1` | `price is invalid` |
| `"0.45000"` | no | `-1` | `price is invalid` |
| `"0.45"` | no | `0` | `orderID: 1274980785` then later `1274980851` |
| `"0.45"` | yes (`138565`) | `0` | `orderID: 1274980787` |
| `"0.4523"` | no | `0` | `orderID: 1274980786` |
| `"0.45225"` | no | `-1` | `price is invalid` (off tick / over-precision) |
| `"0.50"` | no | `-1` | `price is invalid` (band / invalid vs ref) |

**Proven:** Trailing zeros after the significant decimal make SoDEX reject a price that is numerically equal to a valid tick. HATCH `mid.toFixed(4)` on `0.45` yields `"0.4500"` → reject. sosomind strips trailing zeros (see comparison).

### A3. Accepted-then-unfilled (secondary fact, not this attempt’s STOP)

Orders accepted with `"0.45"` / `"0.4523"` later appear in history as:

```json
{
  "orderID": 1274980785,
  "status": "CANCELED",
  "symbol": "vMAG7ssi_vUSDC",
  "price": "0.45",
  "executedQty": "0",
  "executedValue": "0"
}
```

Trades filtered by those orderIDs returned **no MAG7 fills** (API returned unrelated prior WSOSO/ETH rows when `orderID` filter is ignored/loose — none matched the new IDs as MAG7 fills). Combined with `asks: []` before submit, this proves a **second** failure mode *if and only if* price formatting is fixed: IOC buy on an empty ask book cancels with zero executed qty.

That second mode did **not** cause the STOP of the primary investment attempt.

---

## Comparison vs reference (`D:\route\sosomind`)

| Question | Proven answer | Evidence |
|----------|---------------|----------|
| Same endpoint? | **YES** | Both `POST {spot}/trade/orders/batch` on testnet gateway |
| Same payload shape? | **MOSTLY** — same `accountID` + `orders[]` fields | HATCH body vs sosomind `buildSpotOrderItem` / `sodex-signing` |
| Same price string? | **NO** | HATCH: `mid.toFixed(4)` → `"0.4500"`. sosomind: `formatPrice` → `toFixed(n).replace(/\.?0+$/, '')` → `"0.45"` |
| Same headers? | **NO** | sosomind relay adds `X-API-Chain: {chainId}`. HATCH omits it. Appendix: omission alone does **not** cause reject (`"0.45"` works without chain header) |
| Same signature scheme? | **YES** | EIP-712 `ExchangeAction`, wire `0x01`+r/s/v(0\|1) |
| Same EIP-712 domain? | **YES** | `name:"spot"`, `version:"1"`, `chainId`, `verifyingContract:0x0…0` |
| Same chain id? | **YES** (testnet path) | `138565` |
| Same nonce generation? | **YES** (pattern) | `uint64` from `Date.now()` / ms timestamp |
| Same relay format? | **YES** body; **NO** headers (`X-API-Chain`) | See above |
| Same order type? | **YES** for this path | LIMIT=`1` |
| Same TIF? | **YES** for testnet market-style | IOC=`3` |
| Same symbol id? | **Context-dependent** | This attempt: MAG7 `3`. sosomind often trades BTC/ETH/WSOSO proxies, not Path A MAG7/USSI |
| Same account? | **YES** for eng wallet used here | `54647` / `0xf76e…71a3` |
| Same gateway? | **YES** on testnet | `https://testnet-gw.sodex.dev/api/v1/spot` |
| Same settlement path? | **YES for CLOB** / **NO for Base SSI** | Both settle SoDEX vault balances on fill. Neither Path A fill updates `ssi.sosovalue.com` Base holdings |

### Code proof of price difference

HATCH (`parentSignDraft.ts`):

```144:145:packages/backend/src/services/parentSignDraft.ts
    price: mid.toFixed(4),
    quantity,
```

sosomind (`sodex-market.ts`):

```63:72:../sosomind/packages/dashboard/src/lib/sodex-market.ts
export function formatDecimal(value: number, stepOrPrecision: number, mode: 'round' | 'floor' = 'round'): string {
  // ...
  return scaled.toFixed(decimals).replace(/\.?0+$/, '') || '0';
}
export function formatPrice(value: number, symbol: SodexSymbolMeta): string {
  return formatDecimal(value, getTickSize(symbol));
}
```

---

## Root cause (only after differences explained)

### For this complete investment attempt

**Root cause = HATCH price serialization.**

1. HATCH builds LIMIT IOC at mid with `price: mid.toFixed(4)`.
2. For `lastPx=0.45`, that emits `"0.4500"`.
3. SoDEX returns HTTP 200 with body `code:-1 error:"price is invalid"`.
4. No orderID → no history row → no trade → no balance change → no explorer/DB fill trail.
5. Empty ask book is observed but **did not cause this STOP**; the exchange rejected before accept.
6. Missing `X-API-Chain` is a real HATCH vs sosomind difference but is **proven non-causal** for this reject (`"0.45"` accepts without it).

### Secondary mode (proven only after fixing price string; not this attempt)

If price is formatted like sosomind (`"0.45"`), the order can be accepted, then IOC-cancel with `executedQty=0` while `asks:[]`. That explains older “Synchronization Pending / WAITING_FOR_MATCH” symptoms **when** the price string happens to be accepted (e.g. mids whose `toFixed(4)` has no trailing zero pad, such as `0.4523`).

### Not claimed as proven by this attempt

- Base SSI site balance movement (wrong settlement surface for Path A).
- Any fill of `vMAG7.ssi` on this attempt (impossible — no orderID).

---

## Files

| Path | Role |
|------|------|
| `artifacts/protocol_trace_raw.json` | Machine dump of primary attempt |
| `packages/backend/scripts/protocol-trace.mts` | Reproducible capture script |
| `ROOT_CAUSE_ANALYSIS.md` | Prior research (superseded on “empty book as primary STOP” for this attempt) |
