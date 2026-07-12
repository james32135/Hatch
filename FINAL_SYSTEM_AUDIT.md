# FINAL_SYSTEM_AUDIT.md

> Captured: 2026-07-12  
> Companion to `EXECUTION_TRACE.md`, `SYSTEM_AUDIT.md`, protocol traces.  
> Goal: Claude + Robinhood + Perplexity experience on official SoDEX / wallet / explorer data only.

---

## Executive verdict

| Area | Status |
|------|--------|
| Custody (parent invest) | **OK** — parent signs; backend relays; no server trading key |
| Signature wire format | **Fixed** — MetaMask `v` normalized to SoDEX `0\|1` |
| Liquidity routing | **OK** — scan → score → auto-reroute; evidence persisted |
| Explorer semantics | **Fixed** — orders ≠ HATCHLog; parent address link correct |
| Agent UX | **Rebuilt** — full-width copilot, markdown, chips, context panel |
| Mocks / fake fills | **OK** — fills only from order history + trades |
| Remaining risks | Profile mismatch FE/BE; mainnet eng credentials gap; Redis dependency |

---

## Broken (fixed this mission)

| Issue | Impact | Fix |
|-------|--------|-----|
| MetaMask `v=27\|28` → SoDEX reject | `hatchStatus: FAILED` at relay | `toSodexWireApiSign` FE + BE |
| Order “View on explorer” → HATCHLog `0xB448` | Fake ownership confusion | SoDEX app + parent ValueScan address |
| `live.vc.explorerUrl` never set | Parent explorer link dead | Use `config.valuechain.{network}.explorerUrl` |
| Agent as dashboard sidebar chat | Not flagship | Rewrote `Agent.tsx` (Claude/Perplexity layout) |
| Route evidence only in React state | Not reproducible | `route` on relay + `sodexResponseJson.routeEvidence` |
| Opaque FAILED toast | Hard to debug | Surface `sodexError` / SoDEX message in relay response |

---

## Risky

| Item | Why | Mitigation |
|------|-----|------------|
| FE/BE profile skew | `VITE_DEFAULT_PROFILE` vs `HATCH_DEFAULT_PROFILE` | Settings + `X-HATCH-Profile`; document in Settings |
| Redis required at boot | Workers / rate limit fail without Redis | Health check; Render Redis provisioned |
| No SoDEX fill webhooks | Poll-only latency | BullMQ `order_fill_verify` + UI poll |
| Eng wallet in `.env` | Accidental misuse on mainnet | `assertMainnetTestGuard` + eng-only signer module |
| AI context truncation | Large books / portfolios | Agent cites sources; never invents fills |

---

## Wrong / misleading (corrected or documented)

| Item | Truth |
|------|-------|
| HATCHLog as order receipt | HATCHLog is audit/transparency contract, not CLOB settlement |
| Path A fills update Base SSI site | **No** — Path A = SoDEX vault tokens (`v*`) on ValueChain profile |
| `FAILED` means deployer traded | **No** — means relay/gateway reject for that parent signature |
| CLOB fill appears as EVM tx | **No** — verify via SoDEX history/trades/balances |

---

## Unused / duplicated

| Item | Note |
|------|------|
| `.env` `SODEX_SYMBOL_*` | Unused in `src/`; live symbols API used |
| `SODEX_SYMBOLS` static map | Config/metadata only |
| Dual-leg MAG7+USSI draft | Test/legacy; production uses `draftRoutedParentSign` |
| Duplicate `normalizeEcdsaV` in `engSodexSigner.ts` | Eng module keep; production uses `sodexSign.ts` |

---

## Security

| Check | Result |
|-------|--------|
| Backend custody of SoDEX trading keys on parent path | **None** |
| Child JWT cannot relay | Enforced (`forbidden_child_write`) |
| Signer must match session wallet | `assertMasterWalletSigner` |
| Payload hash must match body | `assertRelayBodyMatchesPayloadHash` |
| Notional caps / kill switch / allowlist | Present |
| Secrets in repo | `.env` gitignored; never commit `github_token` / `SODEX_PRIVATE_KEY` |

---

## Architecture

```
Wallet (SIWE + EIP-712)
  → API (auth, sign-draft, relay, portfolio, agent)
  → SoDEX Gateway (official REST)
  → Workers (fill verify, portfolio sync, lessons)
  → UI (Allowance path, Agent copilot, Activity receipts)
```

| Layer | Notes |
|-------|-------|
| Contracts | HATCHLog / HATCHSchedule on ValueChain — transparency, not trade custody |
| ABIs | Present for VC contracts; CLOB is REST not ABI |
| RPC | ValueChain + Base profile-switched |
| Indexers | No CLOB indexer; SoDEX REST is SoT |
| Queues | BullMQ via Redis |
| Cron | Allowance due handoffs in scheduler |

---

## Performance

| Item | Note |
|------|------|
| Sign-draft market scan | Parallel orderbooks; keep timeout bounded |
| Agent | Soft client-side reveal (not token SSE yet) |
| Portfolio | Live REST; 30s UI refresh |

---

## Agent (Phase 3) checklist

- [x] Full-width conversation (~70–75%)
- [x] Collapsible right context (markets + portfolio)
- [x] Grouped quick prompts
- [x] Markdown + GFM tables
- [x] Empty-state animated SVG
- [x] Cite live SoDEX / portfolio context; no invented fills
- [ ] True HTTP token streaming (follow-up)
- [ ] Inline order/receipt widgets in chat bubbles (follow-up)

---

## Deploy notes

1. **Render** must redeploy API for signature + route persistence + agent prompt.
2. **Vercel** must redeploy frontend for Agent + wire normalize + explorer links.
3. Keep `X-HATCH-Profile` aligned with Practice vs Mainnet.

---

## STOP if observed in production

1. Any parent invest signed by deployer / `SODEX_PRIVATE_KEY`.
2. Fills credited without matching SoDEX order history + trades.
3. Order receipts linking HATCHLog as the trading wallet.
