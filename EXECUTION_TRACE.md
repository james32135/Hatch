# EXECUTION_TRACE.md

> Captured: 2026-07-12  
> Scope: complete parent investment lifecycle (Path A / SoDEX vault)  
> Mode: evidence from code paths only. No assumptions.

---

## Verdict

**There is no hidden custodial execution on the production parent invest path.**

- The connected MetaMask wallet signs every ExchangeAction.
- The backend verifies the recovered signer equals the SIWE session wallet, then forwards that signature.
- `SODEX_PRIVATE_KEY` / deployer keys are **not** used for parent invest. They exist only in eng/test scripts (`engSodexSigner.ts`).
- CLOB fills credit the **parent SoDEX account** tied to that wallet. They are not EVM txs on ValueChain.

The production `FAILED` UI state for USSI-style routes was **not** deployer execution. Primary code-path causes:

1. MetaMask ECDSA `v=27|28` forwarded without normalizing to SoDEX wire `v=0|1` → gateway reject → `hatchStatus: FAILED` at relay time. **Fixed** via `toSodexWireApiSign` on FE + BE relay.
2. Misread explorer links: order cards previously pointed at HATCHLog `0xB448…` (ValueScan contract page), which looks like “wrong wallet / no fills.” **Fixed**: order → SoDEX app; parent identity → `{explorer}/address/{connectedWallet}`.

---

## Lifecycle (Wallet → Receipt)

| Step | Who | Code |
|------|-----|------|
| 1. Connect wallet | Parent MetaMask | `frontend/src/components/common/ConnectAndSignIn.tsx` |
| 2. SIWE session | Parent signs login message → JWT `wallet` | `packages/backend/src/routes/auth.ts` |
| 3. Sign-draft | Backend scans books, picks route, builds unsigned EIP-712 | `POST /api/allowances/sign-draft` → `draftRoutedParentSign` + `selectExecutionRoute` |
| 4. EIP-712 payload | `ExchangeAction { payloadHash, nonce }` domain `spot/1/chainId/0x0` | `parentSignDraft.ts`, `sodexSign.ts` |
| 5. Signature | Parent `signTypedDataAsync({ account: address })` | `ChildAllowance.tsx` |
| 6. Wire normalize | `0x01` + r/s/v(0\|1) | `frontend/src/lib/sodexSign.ts` + `packages/backend/src/services/sodexSign.ts` |
| 7. Relay | Backend verifies signer == session wallet; **does not re-sign** | `POST /api/sodex/relay` |
| 8. SoDEX Gateway | `X-API-Sign`, `X-API-Nonce`, `X-API-Chain` | `SodexClient.relay` → `/trade/orders/batch` |
| 9. Order | SoDEX assigns `orderID` if accepted | `parseBatchRelayResponse` |
| 10. Trade / match | SoDEX matching engine (off-repo) | Polled via order history + trades |
| 11. Settlement | Vault balance deltas on SoDEX account | Not an EVM transfer for CLOB fills |
| 12. Explorer (truth) | SoDEX portfolio / order history | App URL from profile |
| 13. Explorer (VC address) | Parent wallet on ValueScan | `{valuechainExplorer}/address/{wallet}` |
| 14. Portfolio | Live SoDEX balances for parent wallet | `GET /api/portfolio/:childId` |
| 15. Receipt | Verification panel + `InvestmentReceipt` | Order history + trades + route evidence |

```
MetaMask (parent)
    │ SIWE
    ▼
Backend session (JWT.wallet = MetaMask)
    │ sign-draft (unsigned)
    ▼
MetaMask EIP-712 ExchangeAction
    │ toSodexWireApiSign
    ▼
Backend relay (verify only → forward)
    ▼
SoDEX Gateway → Order → Trade → Vault balances
    ▼
Portfolio + Receipt (same wallet / accountID)
```

---

## Six identity checks (MUST match)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Which wallet signs? | Connected parent MetaMask | `ChildAllowance.tsx` `signTypedDataAsync({ account: address })` |
| 2 | Which wallet owns the SoDEX account? | Same parent wallet → `accountID` from `/accounts/{wallet}/state` | `parentAccountId.ts` |
| 3 | Which wallet is used by relay? | **None.** Relay is HTTP forward of parent `X-API-Sign`. | `sodex.ts` relay; `SodexClient` never signs |
| 4 | Which wallet appears on ValueChain Explorer for orders? | CLOB fills are **not** VC txs. Correct parent link is `/address/{connectedWallet}`. HATCHLog `0xB448` is audit contract only. | Fixed in `ChildAllowance.tsx` / `InvestmentReceipt.tsx` |
| 5 | Which wallet owns balances? | Parent SoDEX vault (wallet-keyed) | `portfolio.ts` |
| 6 | Which wallet pays gas? | **No EVM gas for invest.** EIP-712 + REST. SIWE is off-chain. | Protocol design |
| 7 | Which wallet receives fills? | Parent SoDEX account (same wallet) | `orderFillVerify.ts` balances/trades |

**Identity chain (must be one person):**

`MetaMask address → SoDEX accountID → Backend JWT wallet → Explorer parent address → Portfolio balances → Trade history → Receipts`

---

## FAILED vs CANCELED / REJECTED

| Status | When |
|--------|------|
| `FAILED` | Relay HTTP fail **or** SoDEX top-level `code !== 0` (gateway / wire reject) |
| `REJECTED` | Relay accepted batch but leg failed, **or** post-match SoDEX status `CANCELED` / `EXPIRED` / `REJECTED` |
| `SUBMITTED` → poll → `FILLED` / `PARTIAL` / `REJECTED` | Fill oracle from order history |

IOC into empty asks typically becomes SoDEX `CANCELED` → HATCH `REJECTED`, not deployer `FAILED`.  
Screenshot `FAILED` at relay time is consistent with invalid wire signature (v) or gateway error string — now surfaced as `sodexError` / `note`.

---

## Liquidity route evidence (Phase 2)

Stored on every routed invest:

- `why`, `score`, `askDepthUsd`, `bestAsk`, `maxSlippageBps`, `referenceAsk`, `scannedAt`, `considered[]`
- Returned on sign-draft as `draft.route`
- Embedded in `relayRequest.route`
- Persisted on `SignedOrder.sodexResponseJson.routeEvidence`

Preferred Path A indices (MAG7 / USSI by risk) only if **executable**; otherwise highest-score liquid market. Empty asks are never submitted.

---

## STOP conditions (custodial)

If any of these appear on parent invest, halt and fix:

- [ ] `engSodexSigner` / `SODEX_PRIVATE_KEY` imported into `routes/sodex.ts` or `allowances.ts`
- [ ] Relay builds a new signature instead of forwarding parent `apiSign`
- [ ] `assertMasterWalletSigner` skipped
- [ ] Explorer / receipt attributes fills to deployer or HATCHLog as if they were the trader

**Current state:** none of the STOP conditions are true on the parent invest path.

---

## Related artifacts

- `PROTOCOL_TRACE.md` / `PROTOCOL_TRACE_V2.md` — live gateway price / fill experiments  
- `ROOT_CAUSE_ANALYSIS.md` — empty MAG7 asks, Path A ≠ Base SSI site  
- `SYSTEM_AUDIT.md` / `FINAL_SYSTEM_AUDIT.md` — broader system issues  
