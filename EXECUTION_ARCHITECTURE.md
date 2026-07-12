# EXECUTION_ARCHITECTURE.md

> Captured: 2026-07-12  
> Scope: HATCH Path A invest pipeline after market-discovery redesign

---

## Goal

Every investment submits **only** into a market that is executable **right now**, discovered from official SoDEX APIs. No preferred symbols. No hardcoded MAG7/USSI/SSI selection. Fills are proven only from SoDEX order history, trades, and balances.

---

## Flow

```
Parent opens Allowance
        │
        ▼
GET /api/sodex/markets/executable?notionalUsd=N
  → scan ALL symbols + orderbooks + tickers
  → MarketExecutionReport { available[], unavailable[] }
        │
        ▼
Parent selects one Available market
        │
        ▼
POST /api/allowances/sign-draft { policyId, symbol }
  → re-scan live
  → selectExecutionRoute(chosenSymbol)  // must still be executable
  → UNSIGNED EIP-712 ExchangeAction draft
        │
        ▼
MetaMask signTypedData (parent wallet)
  → toSodexWireApiSign (v=0|1)
        │
        ▼
POST /api/sodex/relay
  → assertMasterWalletSigner(parent)
  → assertMarketStillExecutable(symbol)   // fresh book check
  → snapshot balancesBefore
  → forward X-API-Sign to SoDEX gateway
        │
        ▼
SoDEX matching (LIMIT + IOC)
        │
        ▼
verifySignedOrderAgainstSodex
  FILLED iff executedQty > 0 AND tradeIds.length > 0
           AND (balance increased when snapshot exists)
        │
        ▼
portfolio_sync from live balances
```

---

## Components

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Discovery | `marketLiquidity.ts` | Scan, score, gate, report |
| Draft | `parentSignDraft.ts` `draftRoutedParentSign` | Single-leg batch new order |
| Relay | `routes/sodex.ts` | Verify + forward + pre-submit gate |
| Fill oracle | `orderFillVerify.ts` | History + trades + balances |
| UI | `ChildAllowance.tsx` | Available / Unavailable cards + pick |

---

## Order shape (protocol)

- Spot write: `POST /trade/orders/batch` with `batchNewOrder`
- Type: LIMIT (`1`) + IOC (`3`) with ask + slippage buffer
- Price/qty: tick/step aware; trailing zeros stripped
- Account: parent `accountID` from `/accounts/{wallet}/state`

---

## Identity

Parent MetaMask = SoDEX account owner = JWT wallet = portfolio balances = fill recipient.  
Backend never custodies SoDEX trading keys on this path.

---

## Non-goals

- Base SSI website auto-update from Path A fills
- Treating HATCHLog contract page as an order receipt
- Inferring FILLED from relay HTTP `code: 0` alone
