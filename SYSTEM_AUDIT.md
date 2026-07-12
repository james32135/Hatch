# SYSTEM_AUDIT.md

> Captured: 2026-07-12  
> Scope: contracts, RPCs, SoDEX client, workers, env, explorers, EIP-712  
> Mode: evidence-oriented. Fixes applied in the same change set where noted.

---

## Summary

| Category | Count (approx) | Notes |
|----------|----------------|-------|
| Broken (fixed this PR) | 2 | Price pad reject; MAG7 empty-ask submits |
| Missing (added) | 3 | Orderbook client; liquidity scanner; Agent API |
| Wrong / incomplete | several | Documented below |
| Unused / deprecated | few | `SODEX_SYMBOL_*` env unused; static ID fallbacks |
| Mainnet gap | 1 | No mainnet SoDEX trading credentials in eng `.env` |

---

## Critical (fixed)

| Issue | Evidence | Fix |
|-------|----------|-----|
| `price is invalid` on `"0.4500"` | PROTOCOL_TRACE.md | `formatPrice` strip zeros |
| Submit into MAG7 with `asks: []` | PROTOCOL_TRACE_V2 + UI stuck Waiting | Liquidity scan + `selectExecutionRoute` refuses empty asks; routes to highest-score executable |
| Missing `X-API-Chain` vs reference | sosomind relay | Added on `SodexClient.relay` |

---

## SoDEX / execution

| Item | Status |
|------|--------|
| EIP-712 domain `spot/1/chainId/0x0` | OK |
| Wire sig `0x01`+r/s/v | OK |
| Gateway testnet `testnet-gw.sodex.dev` | OK |
| Gateway mainnet `mainnet-gw.sodex.dev` | Configured in `addresses.ts` |
| Orderbook API | Was script-only → now `SodexClient.orderbook` + `/api/sodex/markets/executable` |
| Fill oracle | OK — `orders/history` + `trades` |
| Portfolio | OK — live balances only (no snapshot promotion) |

---

## Contracts & networks

| Surface | Location | Status |
|---------|----------|--------|
| ValueChain HATCH log/schedule | `HATCH_CONTRACTS` + env | Verify deployed addresses on each net before mainnet write |
| Base SSI tokens | `TOKENS` / `SSI_PROTOCOL` | Read path for staking UI; not Path A fill settlement |
| Explorers | `VALUECHAIN.*.explorerUrl` | Linked in UI; CLOB fills are not EVM txs |
| RPC | `VALUECHAIN.*.rpcUrl` | Profile-switched |

### Wrong-network risks

- Frontend default profile can be `mainnet` via `VITE_DEFAULT_PROFILE` while backend defaults `testnet` — parents must keep `X-HATCH-Profile` aligned (Settings).
- Eng wallet `SODEX_ACCOUNT_ID=54647` is **testnet**. Mainnet trading with that key is not proven.

---

## Backend infra

| Component | Status |
|-----------|--------|
| Redis (Upstash / REDIS_URL) | Required at boot |
| BullMQ workers (`order_fill_verify`, `portfolio_sync`, `lesson_generation`) | Present in `jobs/workers.ts` |
| Cron / scheduler | `jobs/scheduler.ts` — allowance due handoffs |
| Webhooks | None for SoDEX fills (REST poll only — intentional) |
| Indexer | No separate chain indexer for CLOB; SoDEX REST is source of truth |

---

## Unused / deprecated

| Item | Note |
|------|------|
| `.env` `SODEX_SYMBOL_*` | Not read by `src/` — live `markets/symbols` used |
| `SODEX_SYMBOLS` static IDs in `addresses.ts` | Metadata / config API only; drafts use live IDs or liquidity route |
| Dual-leg MAG7+USSI draft path | Still in `draftAllowanceParentSign` for tests; production sign-draft uses `draftRoutedParentSign` |

---

## Frontend

| Item | Status |
|------|--------|
| Invest UI infinite "Waiting for SoDEX fill" | Mitigated: terminal CANCELED/EXPIRED/REJECTED stop poll; route card shows why |
| Agent page `/app/agent` | Added — grounded `/api/ai/agent` |
| Activity FAILED `relay_rejected topCode=-1` | Historical from padded price; fixed by formatPrice (requires backend deploy) |

---

## Env checklist

Required for Practice trading:

- `SODEX_PRIVATE_KEY` / eng tests only (parents use MetaMask)
- Backend: JWT, Redis, DB, SoDEX gateway via profile
- AI: provider keys for Agent (else chat fails closed)

Missing for Mainnet parity proof:

- Funded mainnet SoDEX account + parent wallet Enable Trading on mainnet

---

## Remaining product limitations (not bugs)

1. Testnet MAG7 often has **zero asks** — protocol cannot fill IOC buys; engine routes away.
2. Path A never updates Base `ssi.sosovalue.com` holdings by design.
3. Agent quality depends on configured AI provider; context is always live SoDEX/portfolio JSON.
