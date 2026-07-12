# UI_DATA_AUDIT.md

Generated: 2026-07-13  
Scope: All parent child tabs + child view. Trading/SoDEX relay stack is frozen and out of scope for code changes.

## Summary

After a verified WSOSO fill, execution UI is live, but portfolio/overview/child still showed **“Waiting for SSI confirmation”** because that string means **unpriced / unavailable SoDEX portfolio read**, not a real SSI webhook. Lessons repeated “flat” text because generation jobs omitted portfolio delta. Several copy/defaults were stale.

---

## Audit table

| Page | Component | Current source | Expected source | Missing / Wrong API | Temporary placeholder | Priority |
|------|-----------|----------------|-----------------|---------------------|----------------------|----------|
| Allowance | `ChildAllowance.tsx` markets subtitle | Hardcoded “15 stages + dry validation” | Matcher-capability copy | Wrong copy | Yes | P0 |
| Overview / Portfolio | `PortfolioBalanceHero`, `ChildPortfolio`, `ChildDetail` | Heuristic `waitingSsi` + null `projection.totalUsd` | Live SoDEX balances + ticker prices; accurate waiting reason | Balance parse (`B[{a,t}]`); profile-threaded tickers | Misleading “SSI confirmation” | P0 |
| Child Today | `ChildHome.tsx` portfolio card | Same waiting copy | Live holdings after fill | Same as portfolio | Yes | P0 |
| Child Portfolio | `ChildKidPortfolio.tsx` | `source === unavailable` → SSI wait | Live / snapshot labeled | Same | Yes | P0 |
| Lessons | `ChildLessons` + `education.ts` + jobs | `portfolio_delta` without `triggerDelta` → flat + Redis cache | Delta from fill / snapshot change | Wrong job payload | Repeated flat lessons | P0 |
| Child Today | `ChildHome.tsx` next allowance | Static “Coming from your parent” | `/api/allowances` for child | Missing client wiring | Yes | P0 |
| Future | `ChildProjections.tsx` | `amountUsd ?? 20` | Policy amount or empty | Hardcoded $20 | Yes | P1 |
| Future | `projectionEngine` + UI | Documented 3/5/8% bands | Labeled educational assumptions only | N/A (intentional) | Must stay labeled | P1 |
| Future | Chart | Manual “Show story” | Auto-load when policy exists | UX gap | Empty until click | P1 |
| Invest (SSI tab) | `ChildSSI.tsx` | Hardcoded MAG7 steps | Flow API / live holdings | Static override | Yes | P1 |
| Overview | `ChildDetail` tabs | Overview ≡ Portfolio | Distinct summary optional | Duplicate route | P2 |
| Allowance | Fill % display | Eligibility heuristic | Labeled estimate | N/A | Misleading if unread | P2 |
| Dashboard / ChildrenList | Family portfolio | Same freshness helpers | Same fixes | Same | Waiting copy | P1 |
| Trading | `Sodex.tsx` | Matcher capability (post-fix) | Same | OK | No | — |
| Allowance markets | Discovery API | Live executable markets | Same | OK after trading fix | No | — |

## Proven root cause — “Waiting for SSI confirmation”

1. UI gate: `resolveLivePortfolioUsd` requires `projection.totalUsd` (priced balances), not fill status.
2. “SSI confirmation” is **copy**, not a protocol wait — no SSI webhook/indexer.
3. Likely null total after WSOSO fill: compact balance rows with only `a`/`t` skipped by `extractBalances` row detector; ticker supplement used default profile.
4. Snapshots never promoted to live — correct for honesty, but header showed endless “Waiting…” instead of last-known.

## Out of scope (frozen)

SoDEX relay, signing, EIP-712, capability probing, matcher validation, execution routing, Redis capability cache, market discovery, order submission.
