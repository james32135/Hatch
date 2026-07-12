# HATCH Portfolio Data Model Review

Date: 2026-07-13  
Scope: data model and presentation only  
Frozen and unchanged: trading execution, signing, relay, matcher capability, capability probing, Redis, and routing.

## Executive decision

HATCH is **not allocation-based today**.

The database has no child asset ledger, no child cash account, no child lot table, no ownership percentage, and no transfer of SoDEX assets to a child-controlled account. All live balances are read from the parent's one SoDEX spot account.

The implemented product model is therefore:

> **Parent-owned family SoDEX spot account, with child-specific allowance plans, order attribution, and educational experiences.**

A `childId` means:

- this allowance plan belongs to the child's experience;
- this signed order was initiated from that child's plan;
- this lesson is tailored to that child;
- this snapshot was created while viewing that child;
- the child may receive read-only access.

A `childId` does **not** mean:

- the child owns a percentage of the parent account;
- a holding, cash balance, or PnL is allocated to the child;
- a parent-account snapshot is a child portfolio;
- the sum of child cards equals the family account.

## Current architecture

### Live account

1. `users.wallet_address` identifies the parent wallet.
2. `GET /api/portfolio/:childId` uses `childId` for access control, then loads the child's parent.
3. The backend reads the parent's SoDEX spot `state` and `balances`.
4. Quantities are priced with the official SoDEX portfolio asset-price feed.
5. The resulting total and holdings are parent-owned family spot-account values.

### Child context

- `children` stores identity, age, reading level, risk tier, and paused state.
- `allowance_policies` stores a child-specific plan, not funded child cash.
- `signed_orders.child_id` attributes an order to a child plan, but the resulting assets remain in the parent account.
- `lessons.child_id` identifies the lesson recipient.
- `portfolio_snapshots.child_id` identifies the child-view context in which a snapshot was stored; the raw balances are still the parent's account.

### Portfolio API ownership contract

`GET /api/portfolio/:childId` now declares:

- `ownership.model = family_shared_spot_account`
- `ownership.owner = parent`
- `ownership.scope = family`
- `ownership.childAllocationSupported = false`
- `childAllocatedTotalUsd = null`
- `familySpotTotalUsd = <live parent spot value>`
- `valuation.scope = spot_trading_value`

## Intended architecture

### Implemented now: explicit family-account model

The current release intentionally exposes a read-only family spot account to the child. UI terminology must always distinguish:

- family assets (parent-owned);
- child plan settings and attributed orders;
- child-specific educational content;
- illustrative projections.

### Future allocation-based model (not implemented)

HATCH must not claim child ownership until it adds at minimum:

1. `child_allocations` ledger entries for deposits, withdrawals, fills, fees, and adjustments;
2. per-child cash and asset quantity balances;
3. lot-level cost basis;
4. deterministic allocation rules for orders affecting a shared account;
5. fee and partial-fill allocation;
6. immutable audit events and reconciliation to parent-account totals;
7. explicit legal/custodial ownership semantics.

Only after those exist may the UI use “Your Portfolio”, “Your Holdings”, child PnL, or child market value.

## Ownership model

| Concept | Current owner/scope | Evidence |
|---|---|---|
| SoDEX spot cash and tokens | Parent; shown as family context | SoDEX reads use `users.wallet_address` |
| Family spot trading value | Parent/family | Sum of parent SoDEX spot quantities × official SoDEX asset prices |
| Allowance amount and cadence | Child-specific plan | `allowance_policies.child_id` |
| Signed order | Parent-owned execution, child-plan attribution | `signed_orders.parent_id` plus optional `child_id` |
| Order result asset | Parent/family | Fill settles into parent SoDEX account |
| Lesson | Child-specific educational content | `lessons.child_id` |
| Projection | Child-specific educational scenario | allowance input + documented assumptions; starts at $0 |
| Snapshot | Parent/family value tagged to a child-view context | `portfolio_snapshots.raw_balances_json` contains parent account |
| Base/SSI wallet balance | Connected parent wallet | Base `balanceOf(parent wallet)` reads |

## Allocation model

There is no child allocation model.

`AllowancePolicy.amountUsd` is a requested order notional. It is not:

- allocated principal;
- a child cash balance;
- cumulative child contributions;
- proof that filled assets are owned by the child.

`SignedOrder.childId` is attribution metadata. It supports a “Child plan activity” timeline, but it cannot derive current child holdings because:

- parent holdings may predate HATCH;
- assets are fungible inside one account;
- later parent trades can change the same balances;
- fees, partial fills, sales, and cross-child activity are not allocated by a ledger.

## Displayed value source map

| Displayed value | Backend endpoint | Database/external source | Calculation | Owner/scope |
|---|---|---|---|---|
| Family spot trading value | `GET /api/portfolio/:childId` | Parent SoDEX balances; SoDEX `/bolt/coins` prices | Sum of `quantity × official asset price` | Parent/family |
| Cash (vUSDC) quantity/value | Same | Parent SoDEX balances | Quantity; USD value at SoDEX asset price (normally $1) | Parent/family |
| Family spot holding quantity | Same | Parent SoDEX balances/state | Parsed `total` balance; state and balances are not summed | Parent/family |
| Family spot holding USD value | Same | Parent SoDEX balances + asset prices | `quantity × price` | Parent/family |
| Estimated family spot mix | Same | Derived from priced family holdings | `holding value / family spot value × 100` | Parent/family |
| Family account header value | Same | Same as `familySpotTotalUsd` | No per-child calculation | Parent/family |
| Child count | `GET /api/auth/me` | `children` | Row count for parent | Parent account metadata |
| Child age | `GET /api/auth/me` | `children.age_years` | Direct | Child profile |
| Child risk style | `GET /api/auth/me`, `GET /api/allowances` | `children.risk_tier`, `allowance_policies.risk_tier` | Direct label mapping | Child profile/plan |
| Weekly allowance amount | `GET /api/allowances` | `allowance_policies.amount_usd` | Direct | Child-specific plan |
| Cadence | `GET /api/allowances` | `allowance_policies.cadence_days` | Direct | Child-specific plan |
| Next allowance date | `GET /api/allowances` | `allowance_policies.next_due_at` | Direct/relative date formatting | Child-specific plan |
| Slippage cap | `GET /api/allowances` | `allowance_policies.max_slippage_bps` | Basis points ÷ 100 | Child-specific plan |
| Needs approval count | `GET /api/allowances/handoffs` | `system_events` (`allowance_sign_handoff`) | Number of parent-matching pending handoffs | Parent workflow |
| Market best ask/depth/spread | `GET /api/sodex/markets/executable` | Public SoDEX books/tickers | Live book values and derived spread | External market data; no owner |
| Estimated fill probability | Same | Live SoDEX eligibility snapshot | Eligibility/liquidity calculation | Educational execution estimate; no owner |
| Order quantity/price/status | Portfolio transactions, diagnostics, verification endpoints | `signed_orders` + official SoDEX history/trades | Direct stored/request and verified execution fields | Parent execution; child-plan attribution when `child_id` matches |
| Order notional shown in receipt | Same | `signed_orders.quantity`, `signed_orders.price` | `quantity × price` | Parent execution; child-plan attribution |
| Child plan activity timeline | `GET /api/portfolio/:childId/transactions` | `signed_orders WHERE child_id = :childId` | Ordered by creation time; never summed into ownership | Child-plan attribution; assets parent-owned |
| Global activity timeline | `/api/diag/orders`, `/api/allowances/handoffs` | `signed_orders`, `system_events` | Time-ordered events | Parent/family operations |
| Lesson date/status/body | `GET /api/lessons/:childId` | `lessons` | Direct; AI content constrained by child reading level | Child educational |
| Lesson family-account context | Portfolio endpoint + lesson generation | Parent family account or attributed asset | Educational grounding only | Family source, child recipient |
| Projection 3%/5%/8% bands | `GET /api/projections/assumptions` | Code constants | Documented annual assumptions | Educational projection |
| Projection yearly values | `POST /api/projections/scenarios` | Child allowance input; no portfolio table | Annual compounding with 52 weekly or 12 monthly contributions | Child-specific educational projection |
| Projection starting value | Same | Request | Explicitly $0 in child Future page | Educational projection |
| Connected Base/SSI balances | SSI balance endpoint | On-chain `balanceOf` for connected wallet | Direct token quantity | Connected parent wallet |
| Agent portfolio context | `POST /api/ai/agent[/stream]` | Family portfolio endpoint-equivalent context | Parent-owned family spot value and holdings | Parent/family |

## Values removed or suppressed

### Child PnL and performance

Removed from presentation and disabled in the portfolio view model.

The previous calculation compared the complete parent account against either:

- the first snapshot tagged to a child; or
- a sum of allowance policy amounts.

Neither is a valid family cost basis or child cost basis. The API now returns:

- `performance.currentUsd = family spot value`
- `costBasisUsd = null`
- `pnlUsd = null`
- `pnlPct = null`
- `costBasisSource = none`

### Child portfolio history chart

Removed from presentation.

Existing snapshots are parent-account snapshots tagged by child context, and historical rows do not contain a valuation-method version. Old rows may use last-trade pricing while new rows use the official asset-price feed, so plotting them together could fabricate performance.

### Repeated family total on every child card

Removed. The family value is shown once. Child cards now show the child-specific allowance amount or “No child-specific allowance”.

### Child principal, child holdings, child value

Returned as `null`/unsupported because no allocation ledger proves them.

## Reconciliation report

### Scope correction

The official SoDEX UI defines:

- **Total Assets**: Spot + Futures + EVM-Funding.
- **Trading Value**: trading assets excluding Vault deposits and EVM-Funding.
- **Available Balance**: funds available for trading/withdrawal.

HATCH currently reads SoDEX spot balances only. Its correct comparison target is **SoDEX Trading Value**, not SoDEX Total Assets.

### Before correction

Screenshot values:

- HATCH displayed: **$1,285.20**
- Official SoDEX Trading Value: **$1,232.41**
- Difference: **+$52.79 / +4.283%**
- Official SoDEX Total Assets: **$1,244.99**
- Difference: **+$40.21 / +3.230%**

Cause: HATCH used last traded market prices, while the official portfolio uses SoDEX asset valuation prices.

| Asset | Old HATCH price basis | Official SoDEX asset price observed | Difference | Explanation |
|---|---:|---:|---:|---|
| vUSDC | 1.0000 | 1.0000 | 0.000% | Stable quote asset |
| vBTC | 63,929.00 | 63,747.39 | +0.285% | Last trade vs portfolio asset price |
| vETH | 2,068.70 | 1,799.27 | +14.974% | Last trade vs portfolio asset price |
| WSOSO | 0.4500 | 0.3076 | +46.294% | Last trade vs portfolio asset price |
| vSOL | 147.86 | 76.57 | +93.115% | Last trade vs portfolio asset price |
| vBNB | 950.00 | 573.45 | +65.664% | Last trade vs portfolio asset price |
| vSHIB | 0.000008 | 0.000004222 | +89.484% | Last trade vs portfolio asset price |

### After correction

Live validation on 2026-07-13:

- HATCH family spot trading value: **$1,231.7034**
- Screenshot official SoDEX Trading Value: **$1,232.41**
- Difference: **-$0.7066 / -0.0573%**

This is within the required 0.1% threshold. The residual is explained by observation-time price changes between the screenshot and live validation.

Validated HATCH components:

| Asset | Quantity | Official asset price | USD value |
|---|---:|---:|---:|
| vUSDC | 1,047.619532 | 1.000000 | 1,047.619532 |
| vBTC | 0.001119272 | 63,747.39 | 71.350669 |
| vETH | 0.019087585 | 1,799.27 | 34.343719 |
| WSOSO | 131.360901 | 0.3076 | 40.406613 |
| vSOL | 0.0359766 | 76.57 | 2.754728 |
| vBNB | 0.0339779 | 573.45 | 19.484627 |
| vSHIB | 3,728,920.6251 | 0.000004222 | 15.743503 |
| **Total** |  |  | **1,231.703391** |

The difference from SoDEX **Total Assets** remains greater than 0.1% by design because HATCH excludes futures, EVM funding, and external staking. The UI now says “Family SoDEX spot account” and “Spot trading value” rather than claiming complete total assets.

### Reconciliation rules

- Holdings total equals the sum of displayed priced family spot holdings.
- Cash is the parent's vUSDC spot balance.
- Mix percentages use the same component values and denominator as the displayed spot value.
- Timeline notionals are historical order amounts and must never be summed to infer current holdings.
- PnL/performance is not shown until a valid cost-basis ledger exists.

## UI corrections implemented

### Parent

- Dashboard family spot value is shown once.
- Child cards show child-specific allowance values, not duplicated family totals.
- Child header says “Family spot account”.
- Portfolio tab says “Family account”.
- Main value says parent-owned, managed by parent, read-only in child view.
- Mix and holdings say “family spot”.
- Timeline says “Child plan activity” and explains asset ownership.
- Agent context says “Family SoDEX spot account” and is instructed never to imply child ownership.

### Child / Look Only

- “Your Portfolio” changed to “Family spot trading value”.
- “What you own” changed to “Family spot holdings”.
- Navigation “Portfolio” changed to “Family”.
- Copy explicitly says the assets are parent-owned, not allocated to the child.
- Read-only mode continues to prevent signing, trading, settings, and network changes.

### Allowance, Lessons, Future, Invest

- Allowance is identified as a child-specific plan for parent-approved family-account trades.
- Lessons are child-specific education grounded in family-account activity.
- Future scenarios explicitly start at $0 and never import the parent family balance.
- Invest copy states that fills update the parent-owned family account.
- Connected Base/SSI balances are labeled as parent wallet balances.

### Marketing and walkthrough

Claims that “their holdings grow” or “their portfolio updates” were replaced with explicit family-account language.

## Recommended terminology

Use:

- Family SoDEX spot account
- Family spot trading value
- Family spot holdings
- Estimated family spot mix
- Managed by parent
- Read-only family account
- Child-specific allowance plan
- Child plan activity
- Orders attributed to this child's plan
- Child-specific educational projection
- Child lesson grounded in family-account activity

Do not use:

- Your Portfolio
- Your Holdings
- Their Portfolio
- Their Holdings
- Child balance
- Child PnL
- Allocated principal
- Child market value

unless a future allocation ledger proves those claims.

## Remaining inconsistencies and required future work

1. `portfolio_snapshots.child_id` is semantically a view/lesson context, not ownership. A future migration should rename or replace this relationship and add valuation-method/version fields.
2. Legacy lessons already stored or cached may contain old child-ownership wording. New generation is corrected; old records require a reviewed content migration before rewriting.
3. HATCH spot value excludes futures, EVM funding, vault deposits, and external SSI staking. A complete SoDEX “Total Assets” view needs additional read models and explicit source coverage.
4. The SoDEX asset-price endpoint is an official read-only valuation feed used for presentation. Last-trade prices remain fallback only; fallback totals must be labeled and may not reconcile to official Trading Value.
5. `performance` remains in the API shape for compatibility but all unprovable cost-basis/PnL fields are null.
6. A true child portfolio requires the future allocation ledger described above; terminology must not change before that migration is complete.

## Validation

- Live parent testnet balances read successfully.
- Official SoDEX asset-price feed read successfully.
- HATCH spot value reconciled to SoDEX Trading Value within 0.1%.
- Portfolio projection, engine, and agent helper tests passed.
- Full backend suite: 81/82 tests passed; the only failure was the pre-existing live AI provider streaming test timing out after 120 seconds across external providers. No portfolio test failed.
- Backend TypeScript build passed.
- Frontend TypeScript check passed.
- Frontend production build passed.
- Frontend test command reports no test files (exit 1); the repository currently has no frontend Vitest suite.
- Repository-wide ESLint remains red on pre-existing `no-explicit-any` debt (157 errors, 11 warnings across the existing frontend). IDE diagnostics on changed files reported no new errors.
- IDE lint diagnostics reported no errors.

