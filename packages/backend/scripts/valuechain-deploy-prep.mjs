/**
 * ValueChain deploy prep — does NOT invent addresses.
 * Requires VALUECHAIN_DEPLOYER_PRIVATE_KEY in env to run forge.
 * Usage (from packages/contracts): forge script ... --rpc-url $VALUECHAIN_*_RPC_URL --broadcast
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), "../../../.env") });

const key = process.env.VALUECHAIN_DEPLOYER_PRIVATE_KEY?.trim();
const hatchLog = resolve(process.cwd(), "../contracts/src/HATCHLog.sol");
const foundry = resolve(process.cwd(), "../contracts/foundry.toml");

const report = {
  deployerKeyPresent: !!(key && key.length >= 64),
  hatchLogSol: existsSync(hatchLog),
  foundryToml: existsSync(foundry),
  rpc: {
    mainnet: process.env.VALUECHAIN_MAINNET_RPC_URL ?? "https://mainnet.valuechain.xyz",
    testnet: process.env.VALUECHAIN_TESTNET_RPC_URL ?? "https://testnet-v2.valuechain.xyz",
  },
  chainIds: { mainnet: 286623, testnet: 138565 },
  status: "blocked_until_deployer_key",
  next: [],
};

if (!report.hatchLogSol || !report.foundryToml) {
  report.status = "contracts_scaffold_incomplete";
  report.next.push("Ensure packages/contracts/src/HATCHLog.sol and foundry.toml exist");
} else if (!report.deployerKeyPresent) {
  report.status = "waiting_for_VALUECHAIN_DEPLOYER_PRIVATE_KEY";
  report.next.push(
    "Add VALUECHAIN_DEPLOYER_PRIVATE_KEY to .env (throwaway deployer, fund with native SOSO)",
  );
  report.next.push("Then: cd packages/contracts && forge build && forge script … --broadcast");
} else {
  report.status = "ready_to_forge_broadcast";
  report.next.push("Run Foundry deploy against testnet first; record addresses into .env");
  report.next.push("Never use deployer key as a SoDEX user trading key");
}

if (existsSync(hatchLog)) {
  const src = readFileSync(hatchLog, "utf8");
  report.next.push(
    src.includes("contract ")
      ? "HATCHLog.sol present — verify before mainnet"
      : "HATCHLog.sol unexpected contents",
  );
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.deployerKeyPresent ? 0 : 2);
