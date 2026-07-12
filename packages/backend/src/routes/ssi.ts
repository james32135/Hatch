import type { FastifyInstance } from "fastify";
import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import { getEnv } from "../config/env.js";
import { BASE, SSI_PROTOCOL, TOKENS } from "../config/addresses.js";
import { getSoSoValueClient } from "../clients/sosovalue.js";
import { HatchError } from "../lib/errors.js";
import {
  planMint,
  planPathBMint,
  planRedeem,
  planStake,
  ssiCapabilityMatrix,
} from "../services/ssiFlows.js";

const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function registerSsiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/ssi/indices", async () => {
    const data = await getSoSoValueClient().indices();
    return { data };
  });

  app.get("/api/ssi/market-snapshot", async () => {
    const data = await getSoSoValueClient().marketSnapshot();
    return { data };
  });

  app.get("/api/ssi/mag7/constituents", async () => {
    const data = await getSoSoValueClient().mag7Constituents();
    return { data };
  });

  app.get("/api/ssi/capabilities", async () => ssiCapabilityMatrix());

  app.get("/api/ssi/flows/mint", async (req) => {
    const q = req.query as { index?: string; amountUsd?: string };
    const index = q.index === "USSI" ? "USSI" : "MAG7";
    const amountUsd = q.amountUsd ? Number(q.amountUsd) : undefined;
    return {
      pathA: planMint({ index, amountUsd }),
      pathB: planPathBMint(),
      note: "Path A preferred for parents. Path B blocked — WLP-only mint per Whitepaper §5.3.",
      protocol: SSI_PROTOCOL,
    };
  });

  app.get("/api/ssi/flows/redeem", async (req) => {
    const q = req.query as { index?: string };
    const index = q.index === "USSI" ? "USSI" : "MAG7";
    return { pathA: planRedeem({ index }), pathB: planPathBMint() };
  });

  app.get("/api/ssi/flows/stake", async () => ({
    plan: planStake(),
    note: "Per SSI docs: MAG7.ssi deposit auto-stakes; sMAG7.ssi is receipt",
  }));

  app.get("/api/ssi/flows/full", async (req) => {
    const q = req.query as { index?: string; address?: string };
    const index = q.index === "USSI" ? "USSI" : "MAG7";
    return {
      mint: planMint({ index }),
      redeem: planRedeem({ index }),
      stake: planStake(),
      pathB: planPathBMint(),
      balanceRefresh: {
        base: q.address
          ? `/api/ssi/balances/${q.address}`
          : "/api/ssi/balances/:address",
        portfolio: "/api/portfolio/:childId",
        portfolioSyncJob: "portfolio_sync (background)",
      },
      transactionVerification: {
        sodexOrders: "SoDEX CLOB order IDs via /api/diag/orders + SoDEX portfolio",
        valuechainEvents: "HATCHLog / HATCHSchedule explorer links via /api/valuechain/contracts",
        baseTokens: `${BASE.explorerUrl}`,
      },
      capabilities: ssiCapabilityMatrix(),
    };
  });

  app.post(
    "/api/ssi/sync/portfolio",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const body = (req.body ?? {}) as { childId?: string };
      if (!body.childId) {
        throw new HatchError("invalid_body", "childId required", 400);
      }
      const { assertChildAccess } = await import("../lib/childAccess.js");
      await assertChildAccess(req, body.childId);
      const { enqueueJob } = await import("../jobs/queue.js");
      const job = await enqueueJob("portfolio_sync", {
        trigger: "ssi_sync",
        childId: body.childId,
        profileId:
          (req.headers["x-hatch-profile"] as string | undefined) ??
          undefined,
      });
      return {
        ok: true,
        enqueued: [job.id],
        note: "Non-custodial sync — refreshes snapshots; does not place trades. Lessons generate only after a material portfolio delta.",
      };
    },
  );

  app.get("/api/ssi/balances/:address", async (req) => {
    const { address } = req.params as { address: string };
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new HatchError("invalid_address", "Invalid address", 400);
    }
    const rpc = process.env.BASE_RPC_URL ?? BASE.rpcUrl;
    const client = createPublicClient({
      chain: base,
      transport: http(rpc),
    });
    const addr = address as Address;
    try {
      const [mag7, ussi, smag7, defi, meme] = await Promise.all([
        client.readContract({
          address: TOKENS.mag7Ssi,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [addr],
        }),
        client.readContract({
          address: TOKENS.ussi,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [addr],
        }),
        client.readContract({
          address: TOKENS.sMag7Ssi,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [addr],
        }),
        client.readContract({
          address: TOKENS.defiSsi,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [addr],
        }),
        client.readContract({
          address: TOKENS.memeSsi,
          abi: erc20BalanceOfAbi,
          functionName: "balanceOf",
          args: [addr],
        }),
      ]);
      return {
        ok: true,
        chainId: BASE.chainId,
        address: addr.toLowerCase(),
        balances: {
          mag7Ssi: mag7.toString(),
          ussi: ussi.toString(),
          sMag7Ssi: smag7.toString(),
          defiSsi: defi.toString(),
          memeSsi: meme.toString(),
        },
        tokens: TOKENS,
        protocol: SSI_PROTOCOL,
        explorer: {
          mag7: `${BASE.explorerUrl}/token/${TOKENS.mag7Ssi}?a=${addr}`,
          ussi: `${BASE.explorerUrl}/token/${TOKENS.ussi}?a=${addr}`,
          smag7: `${BASE.explorerUrl}/token/${TOKENS.sMag7Ssi}?a=${addr}`,
          defi: `${BASE.explorerUrl}/token/${TOKENS.defiSsi}?a=${addr}`,
          meme: `${BASE.explorerUrl}/token/${TOKENS.memeSsi}?a=${addr}`,
        },
        note: "Base ERC-20 balances only. SoDEX vault balances come from GET /accounts/{addr}/balances.",
        defaultProfile: getEnv().HATCH_DEFAULT_PROFILE,
      };
    } catch (err) {
      throw new HatchError(
        "ssi_balance_failed",
        err instanceof Error ? err.message : String(err),
        502,
      );
    }
  });
}
