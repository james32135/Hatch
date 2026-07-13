---
name: hatch-child-education
description: >-
  Child-facing education and lesson generation for HATCH. Use when writing
  kid-safe portfolio explanations, lesson content, diversification teaching,
  or child route copy. Triggers on /child routes, lessons, Education Agent, or
  look-only portfolio questions.
---

# HATCH Child Education

## Audience

Child JWT sessions use **Look only** mode. Scopes: `read:portfolio`, `read:lessons`. No trading, no signing, no policy edits.

Session storage: `hatch.jwt.child` in `sessionStorage` (isolated from parent `localStorage`).

## Routes

| Path | Purpose |
|------|---------|
| `/child` | Today — portfolio hero, why it changed |
| `/child/learn` | Lessons |
| `/child/family` | Family context |

## Lesson generation

| Method | Path |
|--------|------|
| POST | `/api/lessons/:childId/generate` (parent) |

Triggered by `lesson_generation` job on material portfolio delta (`education.ts` agent).

## Writing rules

1. **Plain language** — ages 8–14, no jargon without definition.
2. **Ownership honesty** — "This is the family's SoDEX account. Your parent manages it."
3. **No financial advice** — teach concepts (DCA, diversification), not "buy now."
4. **Ground in data** — pull portfolio snapshot before explaining "why today."

## MCP + skills stack

1. `hatch-family-portfolio` → live numbers
2. `hatch-ssi-intelligence` → index teaching
3. `hatch-copilot` → `copilot_ask` for draft lesson phrasing (parent JWT)

## Example framing

> "Your family account holds MAG7 and a bit of USDC. MAG7 spreads money across seven big tech companies so one stock doesn't move everything."
