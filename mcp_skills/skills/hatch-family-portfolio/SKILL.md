---
name: hatch-family-portfolio
description: >-
  Grounded family SoDEX spot portfolio analysis for HATCH. Use when explaining
  child look-only views, family_shared_spot_account ownership, live balances,
  snapshots, or portfolio history. Triggers on portfolio questions, PnL,
  attribution, or "family account" language in the HATCH repo.
---

# HATCH Family Portfolio

## Ownership model

HATCH uses **family_shared_spot_account**:

| Field | Value |
|-------|-------|
| Asset owner | Parent SoDEX spot account |
| Child role | Read-only (`read:portfolio`, `read:lessons`) |
| childAllocationSupported | `false` — no child allocation ledger |

Never imply children hold separate on-chain balances. Attribution is via `childId` on plans, signed orders, and lessons.

## MCP tools

Use the `hatch-portfolio` MCP server:

| Tool | When |
|------|------|
| `portfolio_get` | Current valuation, holdings, ownership metadata |
| `portfolio_history` | Snapshot time series |
| `portfolio_transactions` | Signed orders / receipts for a child |
| `children_list` | Parent session child roster |
| `health_check` | API + custody statement |

Set `HATCH_JWT` (parent) and optional `HATCH_PROFILE` (`mainnet`, `testnet`, `mainnet-readonly`).

## API fallback

| Method | Path |
|--------|------|
| GET | `/api/portfolio/:childId` |
| GET | `/api/portfolio/:childId/history` |
| GET | `/api/portfolio/:childId/transactions` |
| POST | `/api/portfolio/:childId/snapshot` (parent only) |

## UI labels

Match production copy:

- **Family SoDEX spot account**
- **Parent-owned**
- **Look only** (child shell)

## Response rules

1. Quote live numbers from API/MCP — do not invent balances.
2. State ownership explicitly when a child asks "my money."
3. Link explorer receipts via `InvestmentReceipt` / `SignedOrder` ids when discussing trades.
