---
name: hatch-investment-copilot
description: >-
  HATCH Investment Copilot operations — multi-provider AI failover, SSE streaming,
  grounded agent queries. Use when debugging Copilot, writing agent prompts,
  or integrating AI tools. Triggers on /app/agent, /api/ai/*, or Copilot errors.
---

# HATCH Investment Copilot

## Surfaces

| Surface | Path |
|---------|------|
| UI | `frontend/src/pages/app/Agent.tsx` |
| Sync API | `POST /api/ai/agent` |
| Stream API | `POST /api/ai/agent/stream` (SSE) |
| Health | `GET /api/ai/health` |

## Provider failover

Configured in `packages/backend/src/clients/ai/index.ts`:

OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenRouter, NVIDIA (×3), Cerebras, SambaNova, Together, Mistral, xAI, Ollama.

Circuit breaker: `clients/ai/circuitBreaker.ts`.

## MCP tools

`hatch-copilot` server:

| Tool | Auth |
|------|------|
| `copilot_health` | Public |
| `copilot_ask` | Requires `HATCH_JWT` (parent) |
| `projections_assumptions` | Public |
| `metrics_snapshot` | Public |

## SSE / CORS

Production streaming uses Fastify `reply.hijack()` for SSE. CORS headers must be reapplied on the raw response (`Access-Control-Allow-Origin`, credentials, `Vary`, `X-HATCH-Trace-Id`).

Browser symptom without fix: `TypeError: Failed to fetch` despite HTTP 200.

## Prompt groups (UI)

Investment · Markets · Portfolio · Learning — see `GROUPS` in `Agent.tsx`.

## Agent guidelines

1. Always pass `childId` when question is child-specific.
2. Prefer stream endpoint for long answers in UI; MCP `copilot_ask` uses sync route.
3. Include sources and follow-ups when present in API response.
4. Never claim MCP or Copilot can sign or relay orders.
