---
name: hatch-ssi-intelligence
description: >-
  SoSoValue SSI research for HATCH Investment Copilot and parent invest flows.
  Use for MAG7, USSI, safest SSI, mint/redeem flows, constituents, and
  capability matrix questions. Triggers on SSI, index, or SoSoValue language.
---

# HATCH SSI Intelligence

## Data source

SSI data flows through `packages/backend/src/clients/sosovalue.ts` and `/api/ssi/*`. Ground answers in live API responses.

## MCP tools

`hatch-ssi` server:

| Tool | Use case |
|------|----------|
| `ssi_indices` | Catalog all indices |
| `ssi_market_snapshot` | Liquidity + pricing context |
| `ssi_mag7_constituents` | MAG7 weights |
| `ssi_capabilities` | Venue support matrix |
| `ssi_flow_mint` / `ssi_flow_redeem` / `ssi_flow_full` | Step-by-step flows |
| `ssi_balances` | Wallet holdings on Base |

## Common parent prompts

| Prompt | First tools |
|--------|-------------|
| Safest SSI | `ssi_capabilities` → `ssi_market_snapshot` |
| Compare MAG7 vs BTC | `ssi_mag7_constituents` + executable SoDEX markets |
| Compare MAG7 vs USSI liquidity | `ssi_market_snapshot` + `markets_executable` |
| How do I mint MAG7? | `ssi_flow_mint` symbol=MAG7 |

## Copilot alignment

Investment Copilot (`/app/agent`) uses the same grounded context. When answering outside the UI, mirror Copilot tone:

- Cite sources (index names, liquidity figures).
- Prefer lowest-volatility, highest-liquidity SSI when asked for "safest."
- Never recommend trades without noting parent must sign.

## Public routes

All `/api/ssi/*` GET routes are public except `POST /api/ssi/sync/portfolio` (parent).
