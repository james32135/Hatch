# EXECUTION_FIXES.md

> Captured: 2026-07-12

---

## Implemented

1. **Market Discovery Engine** — full symbol+book scan; blocked statuses; depth/spread/minNotional gates; scores; fill probability; `MarketExecutionReport`.
2. **No preferred markets** — deleted MAG7/USSI/SSI routing bias; `preferredSymbolOrder` returns `[]`.
3. **Parent market picker** — Allowance UI: Available today cards + Unavailable today reasons.
4. **sign-draft requires symbol** — refuses unsigned drafts without a live-executable choice.
5. **Pre-relay freshness** — `assertMarketStillExecutable` before gateway forward.
6. **Balance snapshot** — `balancesBefore` stored on `SignedOrder` at relay.
7. **Strict FILLED** — `executedQty > 0` + trade id(s) + balance delta (when snapshot present).
8. **Honest terminals** — CANCELED / EXPIRED / REJECTED / FAILED surfaced without fake fills.
9. **Docs** — `EXECUTION_ARCHITECTURE.md`, `MARKET_DISCOVERY.md`, `SYSTEM_CONNECTION_AUDIT.md`, this file.

---

## Files touched

- `packages/backend/src/services/marketLiquidity.ts`
- `packages/backend/src/services/orderFillVerify.ts`
- `packages/backend/src/routes/allowances.ts`
- `packages/backend/src/routes/sodex.ts`
- `packages/backend/tests/marketLiquidity.test.ts`
- `frontend/src/pages/app/ChildAllowance.tsx`

---

## Deploy

1. Run Prisma migrate if schema drift (this change set is logic-only; no new tables).
2. Redeploy Render API + Vercel web.
3. Practice network: only Available markets appear for selection.
