# AI Copilot Audit

**Date:** 2026-07-13  
**Scope:** Investment Copilot (`/app/agent`) — request flow, auth, provider failover, grounding, child vs parent permissions.  
**Out of scope:** SoDEX trading, signing, relay, matcher capability, routing (frozen).

---

## Executive summary

HATCH intentionally uses a **Family Portfolio Viewer** model: child pages show the parent’s shared SoDEX spot account with explicit “parent-owned / read-only” labels. There is **no child allocation ledger**; `childId` attributes plans, orders, and lessons only.

The Copilot was failing for two root causes:

1. **Session collision** — child-view JWT overwrote the parent JWT in `localStorage`, so `/app/agent` sent a child token to parent-only endpoints → `403 Parents only`.
2. **Incomplete provider chain** — only NVIDIA/Groq/Cerebras/SambaNova were wired; `.env` keys for OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, etc. were ignored.

Fixes: isolated parent/child sessions, expanded provider failover, clearer SSE/HTTP errors in the UI.

---

## Request flow

```
Agent.tsx submit()
  → streamAgent()  POST /api/ai/agent/stream  (SSE)
    → app.authenticate (JWT verify)
    → requireParent (role === parent)
    → assertChildAccess (optional childId)
    → runInvestmentAgentStream()
      → buildAgentContext()
          → scanExecutableMarkets (SoDEX orderbooks + capability cache)
          → portfolioEngine (SoDEX account state/balances)
          → signedOrder rows (recent receipts)
      → buildSystemPrompt(contextText)
      → getAiClient().streamChatEvents()  (provider failover)
      → SSE events: progress | thinking | token | done | error
```

Non-stream fallback: `POST /api/ai/agent` → `runInvestmentAgent()` → `getAiClient().chat()`.

Education lessons (separate): `POST /api/lessons/:childId/generate` → `generateLessonForChild()` → `chatJson()`.

---

## Authentication flow

| Step | Mechanism |
|------|-----------|
| Parent sign-in | SIWE → `POST /api/auth/verify` → JWT `{ role: "parent", sub: userId, wallet }` stored in **localStorage** (`hatch.jwt.parent`) |
| Child view | Parent mints `POST /api/auth/child-token` → link `/child#t=<jwt>` → **sessionStorage** (`hatch.jwt.child`) |
| API calls | `Authorization: Bearer <jwt>` + `X-HATCH-Profile` |
| Parent routes | `ParentGuard` (frontend) + `requireParent` (backend) |
| Child routes | `ChildGuard` + `assertChildAccess` on child-scoped reads |

**Bug fixed:** child and parent tokens no longer share one `localStorage` key. Opening child view in another tab cannot silently break Copilot in the parent tab.

---

## Provider flow

Configured providers are discovered from `.env` at boot:

| Provider | Env keys | Adapter |
|----------|----------|---------|
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI SDK |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `@anthropic-ai/sdk` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_MODEL` | Google REST (stream + non-stream) |
| Groq | `GROQ_API_KEY` | OpenAI-compatible |
| DeepSeek | `DEEPSEEK_API_KEY` | OpenAI-compatible |
| OpenRouter | `OPENROUTER_API_KEY` | OpenAI-compatible |
| NVIDIA (×3 models) | `NVIDIA_API_KEY` | OpenAI-compatible |
| Cerebras, SambaNova, Together, Mistral, xAI | respective keys | OpenAI-compatible |
| Ollama | `OLLAMA_BASE_URL` | OpenAI-compatible (local) |

Health: `GET /api/ai/health` returns ordered provider list, circuit breaker state, and `AI_PROVIDER` preference.

---

## Failover flow

Priority (first available key wins per attempt, then chain continues on failure):

1. **`AI_PROVIDER`** explicit match (e.g. `AI_PROVIDER=groq`, or `nvidia` → all three NVIDIA models first)
2. OpenAI
3. Anthropic
4. Gemini
5. Groq
6. DeepSeek
7. OpenRouter
8. NVIDIA primary → alt → alt2
9. Cerebras → SambaNova → Together → Mistral → xAI → Ollama

Per provider:

- Up to `AI_MAX_RETRIES_PER_PROVIDER` retries on transient errors (429, 5xx, timeout, network)
- Circuit breaker opens after `AI_CIRCUIT_FAILURE_THRESHOLD` failures; half-open after `AI_CIRCUIT_COOLDOWN_MS`
- Stream path: empty stream → non-stream fallback for that provider before failing over
- Terminal failure: SSE `error` event with concatenated provider errors; UI shows inline assistant error (never hangs silently)

---

## Child permission model

| Capability | Child JWT |
|------------|-----------|
| Read family portfolio | ✅ `/api/portfolio/:childId` |
| Read lessons | ✅ `/api/lessons/:childId` |
| Investment Copilot | ❌ `403 Parents only` |
| Chat / generate lessons | ❌ parent-only |
| Relay / sign / allowance mutate | ❌ parent-only |

Child UI: `/child/*` only. No Copilot surface in child shell.

---

## Parent permission model

| Capability | Parent JWT |
|------------|------------|
| Investment Copilot (stream + sync) | ✅ |
| Lesson generation | ✅ |
| Portfolio refresh / snapshots | ✅ |
| All trading endpoints | ✅ (unchanged — not modified in this audit) |

Copilot context uses **parent wallet** from JWT + optional `childId` for attributed orders/plans.

---

## Grounding (no invented data)

Context builder pulls **live** data only:

| Data | Source |
|------|--------|
| Executable markets | `scanExecutableMarkets` → SoDEX symbols, tickers, orderbooks |
| Capability / matcher status | Embedded in market scan reject reasons + capability cache |
| Family portfolio | SoDEX `accountState` + `accountBalances` → `portfolioEngine` |
| Recent receipts | `signedOrder` table (+ sodex response JSON) |
| Pricing | SoDEX asset prices / tickers / SoSoValue (portfolio engine) |

System prompt rules: never invent fills, balances, or depth; state family-account ownership; cite missing data explicitly.

**Not in Copilot context:** child allocation ledger (does not exist), Base SSI staking balances (called out as excluded in portfolio API).

---

## Root causes

| # | Issue | Symptom |
|---|-------|---------|
| 1 | Shared `localStorage` JWT for parent + child | Copilot toast **“Parents only”**, no answer |
| 2 | Provider env keys not loaded into failover chain | Stream/all providers fail on hosts with only OpenAI/Anthropic keys |
| 3 | SSE error / HTTP error not rendered in chat | User messages with no visible reply |
| 4 | (Product) Child pages show full family account | Acceptable **only** with Family Viewer labels — implemented in prior commit |

---

## Fixes applied

1. **Session isolation** — parent JWT → `localStorage`; child JWT → `sessionStorage`; route-aware `getJwt()` / `getRole()`.
2. **Provider expansion** — full priority chain with OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter, NVIDIA, and extras.
3. **Failover hardening** — retry, circuit breaker, stream→non-stream fallback, terminal SSE error.
4. **Agent UI** — inline error bubbles; clearer message on `forbidden_child_write`.
5. **`/api/ai/health`** — exposes configured priority list for ops/debug.

---

## Validation

| Check | Result |
|-------|--------|
| Parent `/app/agent` with parent JWT | Stream progress → tokens → done |
| Child JWT on Copilot endpoint | 403 (expected) |
| Provider order unit tests | `ai.providerOrder.test.ts` |
| Live provider tests | `ai.provider.test.ts` (requires `.env` keys) |
| Portfolio / ownership labels | Family Viewer copy on child + parent pages |
| Trading code | Untouched |

### Manual test plan

1. Sign in as parent on `/login` → open `/app/agent` → send “Where should I invest $20?” → expect progress steps and markdown answer with market sources.
2. Open child view link in new tab → return to parent tab → Copilot still works (no Parents only).
3. `GET /api/ai/health` → verify `priority` lists configured providers.
4. Child `/child` → confirm family account labels, no Copilot, read-only holdings.

---

## Remaining notes

- Live `ai.provider.test.ts` streaming case may timeout on slow providers; unrelated to Copilot route logic.
- For production (Render/Vercel), ensure at least one AI key is set on the **API** service, not just locally.
- Optional future: parent-session restore banner when child tab detects stale cross-tab state (session fix makes this rare).
