# SYSTEM_CONNECTION_AUDIT.md

> Captured: 2026-07-12

---

## Connection map

| Surface | Connected? | Notes |
|---------|------------|-------|
| Frontend wallet (wagmi / MetaMask) | Yes | SIWE + EIP-712 invest |
| Backend session JWT | Yes | wallet must match signer |
| SoDEX REST gateway | Yes | profile-switched testnet/mainnet |
| SoDEX relay headers | Yes | Sign, Nonce, Chain |
| Order history / trades / balances | Yes | fill oracle |
| ValueChain RPC | Yes | HATCHLog / schedule transparency |
| ValueChain explorer links | Yes | parent address (not HATCHLog-as-order) |
| Portfolio API | Yes | live SoDEX balances |
| Redis / BullMQ | Required | fill verify + portfolio_sync jobs |
| Postgres | Required | SignedOrder, policies, events |
| Indexer for CLOB fills | N/A | SoDEX REST is source of truth |
| WebSocket market stream | Not used for invest | REST discovery is sufficient for Path A |
| Base SSI site sync | Intentionally disconnected | Path A ≠ site auto-update |

---

## Contracts / ABI / RPC

| Item | Status |
|------|--------|
| HATCHLog / HATCHSchedule addresses | Configured per network in `addresses.ts` |
| ABIs | Present for VC contracts |
| Deployer trading | **Not connected** to invest (correct) |
| CLOB settlement as EVM tx | Not applicable |

---

## Disconnects fixed this mission

| Issue | Fix |
|-------|-----|
| Preferred MAG7/USSI auto-route | Removed; parent picks from live available |
| FILLED from status alone | Requires qty + trade + balance evidence |
| Relay into stale empty book | `assertMarketStillExecutable` pre-submit |
| Invest without market choice | sign-draft requires symbol |

---

## Remaining watch items

- FE/BE profile header skew
- Mainnet credentials / allowlist for production wallets
- True WS streaming for Agent (optional)
