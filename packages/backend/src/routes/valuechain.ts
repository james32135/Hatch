import type { FastifyInstance } from "fastify";
import { HATCH_CONTRACTS, VALUECHAIN } from "../config/addresses.js";
import { verifyHatchContracts } from "../services/valuechainContracts.js";
import { HatchError } from "../lib/errors.js";

export async function registerValuechainRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/api/valuechain/meta", async () => ({
    networks: VALUECHAIN,
    contracts: HATCH_CONTRACTS,
    custody: false,
    upgradeable: false,
    note: "HATCHLog/HATCHSchedule are audit/transparency only — no fund custody",
  }));

  app.get("/api/valuechain/contracts", async (req) => {
    const q = (req.query as { network?: string }).network;
    const network = q === "testnet" ? "testnet" : "mainnet";
    if (network === "testnet" && !HATCH_CONTRACTS.testnet.log) {
      return {
        ok: false,
        network,
        error: "testnet_not_deployed",
        note: "Fund deployer via testnet faucet then forge broadcast",
        contracts: HATCH_CONTRACTS.testnet,
      };
    }
    try {
      return await verifyHatchContracts(network);
    } catch (err) {
      throw new HatchError(
        "valuechain_verify_failed",
        err instanceof Error ? err.message : String(err),
        502,
      );
    }
  });
}
