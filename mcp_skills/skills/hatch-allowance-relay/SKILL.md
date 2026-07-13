---
name: hatch-allowance-relay
description: >-
  Parent-signed allowance and SoDEX relay workflow for HATCH. Use when drafting
  sign handoffs, explaining EIP-712 order flow, relay status, fill verification,
  or why orders were not filled. Triggers on allowance, sign-draft, relay, or
  custody questions.
---

# HATCH Allowance & SoDEX Relay

## Non-custodial rule

The backend **relays parent signatures only**. It never holds parent SoDEX trading keys. `SODEX_PRIVATE_KEY` is for internal engineering tests, not parent trades.

## Lifecycle

```text
POST /api/allowances          → policy created
allowance_scheduler job       → sign handoff due
POST /api/allowances/sign-draft → EIP-712 draft
wallet sign                   → parent signature
POST /api/sodex/relay         → SoDEX submission
order_fill_verify job         → fill confirmation
portfolio_sync                → snapshot update
lesson_generation             → education trigger
```

## MCP tools

`hatch-sodex` server:

| Tool | Purpose |
|------|---------|
| `markets_executable` | Eligible markets + liquidity |
| `sodex_readiness` | Balances, caps, kill switch |
| `order_verification` | Post-relay fill proof |
| `sodex_meta` | Active profile + gateway |
| `config_surface` | `TRADING_MAX_NOTIONAL_USD`, profiles |

## Safety controls

| Control | Env / flag |
|---------|------------|
| Kill switch | `KILL_SWITCH` blocks relay |
| Notional cap | `TRADING_MAX_NOTIONAL_USD` |
| Read-only profile | `mainnet-readonly` — no writes |
| Child JWT | Cannot relay or mutate policies |

## Parent guidance

When explaining unfilled orders:

1. Pull `order_verification` for the `SignedOrder` id.
2. Check executable market liquidity via `markets_executable`.
3. Confirm readiness (balance, allowance) via `sodex_readiness`.
4. Cite SoDEX response JSON from Activity / receipts — do not speculate.
