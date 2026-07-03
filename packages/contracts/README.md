# HATCH contracts (ValueChain)

- `src/HATCHLog.sol` — append-only audit events; **no fund custody**
- `script/DeployHATCHLog.s.sol` — Foundry deploy skeleton

## Prerequisites

1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation)
2. `forge install foundry-rs/forge-std --no-commit`
3. Set `VALUECHAIN_DEPLOYER_PRIVATE_KEY` (throwaway; fund with native SOSO)
4. Never use that key as a SoDEX user trading key

## Deploy (testnet first)

```bash
forge script script/DeployHATCHLog.s.sol:DeployHATCHLog \
  --rpc-url https://testnet-v2.valuechain.xyz \
  --private-key $VALUECHAIN_DEPLOYER_PRIVATE_KEY \
  --broadcast
```

Copy the printed address into `HATCH_LOG_ADDRESS_TESTNET` in `.env`.
