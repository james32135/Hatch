# FINAL_GAP_REPORT

Generated: 2026-07-13  
Updated after implementation + signed validation.  
Scope: mismatches after re-reading investigation reports, official SoDEX schema (`Symbol.status` = `TRADING|HALT` only), live testnet APIs, and HATCH code.

---

## Resolved in this change set

### GAP-1 — Dry reads labeled as gateway / IOC acceptance — FIXED
Renamed stages; `gatewayValidation` is now a signed capability label (`MATCHER_OK` / `FILL_OK` / `CANCEL_ONLY` / `UNVERIFIED` / `FAIL`).

### GAP-2 — Invest routing ignores signed capability — FIXED
`marketCapability.ts` seeds from `MARKET_PROBE_TESTNET.json` + Redis; `executable` requires `signed_matcher_capable`.

### GAP-3 — Cancel-only does not invalidate — FIXED
Relay records cancel-only negatives and matcher-accepted positives.

### GAP-4 — Verification script false IOC claim — FIXED
Script no longer claims live submits; uses capability records.

### Extra (proven during validation)
- Integer tick sizes (BTC `tick=1`) were misformatted as precision — fixed in `formatDecimal`.
- Wide-spread matcher-capable books were blocked by the 5% spread gate despite proven fills — waived when signed matcher capability exists.

**Signed validation (2026-07-12T21:51Z):**
- `vNVDA_vUSDC`: pre `CANCEL_ONLY` / not executable; live write `symbol is in cancel only mode`.
- `vBTC_vUSDC`: pre `FILL_OK` / executable; live write orderID `1275000338`, history status `FILLED`.

---

## Still unresolved

## GAP-5 — Explorer wallet transactions cannot prove fills (blocks `verifiedSafe`)

**Proven root cause:** `GET …/clobscan-testnet…/spot/account/transactions` returns empty while SoDEX order/trade APIs show fills.

**Evidence:** `SAFE_MARKETS_TESTNET.md`; live empty explorer; BTC fill proven via order history `FILLED` without explorer row.

**Files:** none for protocol linkage. App keeps `verifiedSafe: false` always until explorer mapping exists. Routing uses `matcherCapable` / `fillCapable` only.

---

## GAP-6 — Positive capability expires; continuous refresh is ops-dependent

**Proven root cause:** Live positives TTL 5m; probe seed TTL 6h. Without re-running `probe-sodex-market-capabilities.mts --execute` or successful relays, markets revert to `UNVERIFIED`.

**Evidence:** `IMPLEMENTATION_PLAN.md` TTL; capability store design.

**Files / ops:**
- `packages/backend/scripts/probe-sodex-market-capabilities.mts`
- schedule / re-run probe to refresh Redis seed
