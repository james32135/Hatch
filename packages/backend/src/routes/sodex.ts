import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Hex } from "viem";
import { getEnv } from "../config/env.js";
import { resolveProfile } from "../config/environment.js";
import { SODEX } from "../config/addresses.js";
import { createSodexClient, sodexGatewayMeta } from "../clients/sodex.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import {
  assertMasterWalletSigner,
  extractAccountId,
} from "../services/sodexSign.js";
import { assertNotionalCap } from "../services/notional.js";
import { assertRelayRateLimit } from "../services/relayRateLimit.js";
import {
  assertMainnetTestGuard,
  isEngSodexTestWallet,
} from "../services/mainnetTestGuard.js";
import { estimateNotionalUsd } from "../services/notional.js";
import { assertRelayBodyMatchesPayloadHash } from "../services/parentSignDraft.js";
import { draftCancelParentSign } from "../services/parentSignDraft.js";
import { resolveParentSodexAccountId } from "../services/parentAccountId.js";
import { SPOT_ACTION_BATCH_CANCEL, SPOT_ACTION_BATCH_NEW } from "../services/spotOrders.js";
import {
  parseBatchRelayResponse,
  pollUntilTerminal,
  verifySignedOrderAgainstSodex,
} from "../services/orderFillVerify.js";
import { enqueueJob } from "../jobs/queue.js";

const relaySchema = z.object({
  method: z.enum(["GET", "POST", "DELETE"]).default("POST"),
  path: z.string().min(1),
  body: z.unknown().optional(),
  apiSign: z.string().min(1),
  apiNonce: z.string().min(1),
  apiKeyName: z.string().optional(),
  payloadHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  scope: z.enum(["spot", "futures"]).default("spot"),
  apiKeyPubkey: z.string().optional(),
  childId: z.string().optional(),
  clOrdId: z.string().optional(),
  symbolId: z.number().int().optional(),
  symbolName: z.string().optional(),
  side: z.string().optional(),
  quantity: z.string().optional(),
  price: z.string().optional(),
});

function profileFromRequest(req: { headers: Record<string, unknown> }) {
  const header = req.headers["x-hatch-profile"] as string | undefined;
  return resolveProfile(header ?? getEnv().HATCH_DEFAULT_PROFILE);
}

export async function registerSodexRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/sodex/meta", async (req) => {
    const profile = profileFromRequest(req);
    return sodexGatewayMeta(profile);
  });

  app.get(
    "/api/sodex/readiness",
    { preHandler: [app.authenticate] },
    async (req) => {
      const profile = profileFromRequest(req);
      const client = createSodexClient(profile);
      const wallet = req.user.wallet;
      let state: unknown = null;
      let error: string | undefined;
      let accountId: number | null = null;
      try {
        state = await client.accountState(wallet);
        accountId = extractAccountId(state);
        if (accountId) {
          await getPrisma().user.update({
            where: { id: req.user.sub },
            data:
              profile.id === "testnet"
                ? { sodexAccountIdTestnet: accountId }
                : { sodexAccountIdMainnet: accountId },
          });
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      let nextStep: "READY" | "ENABLE_TRADING" | "OPEN_SODEX" | "FUND" | undefined;
      if (error) nextStep = "OPEN_SODEX";
      else if (!accountId) nextStep = "ENABLE_TRADING";
      else nextStep = "READY";

      return {
        wallet,
        profile: profile.id,
        appUrl: client.appUrl,
        enableTradingUrl: client.appUrl,
        accountId,
        accountState: state,
        nextStep,
        error,
        custody: false,
        note: "Parent must Enable Trading and fund their own SoDEX account. Backend does not custody keys.",
      };
    },
  );

  app.get("/api/sodex/markets/symbols", async (req) => {
    const profile = profileFromRequest(req);
    const data = await createSodexClient(profile).marketsSymbols();
    return { profile: profile.id, data };
  });

  /** Live liquidity scan + suitability scores (official books only). */
  app.get("/api/sodex/markets/executable", async (req) => {
    const profile = profileFromRequest(req);
    const { scanExecutableMarkets } = await import("../services/marketLiquidity.js");
    const markets = await scanExecutableMarkets(profile);
    return {
      profile: profile.id,
      scannedAt: new Date().toISOString(),
      scanned: markets.length,
      executable: markets.filter((m) => m.executable).length,
      markets,
    };
  });

  /**
   * UNSIGNED cancel draft — parent signs typedData then DELETE via /api/sodex/relay.
   */
  app.post(
    "/api/sodex/cancel-draft",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const body = z
        .object({
          symbolID: z.number().int().positive(),
          clOrdID: z.string().min(1).max(36),
          orderID: z.number().int().positive().optional(),
          accountID: z.number().int().positive().optional(),
          network: z.enum(["mainnet", "testnet"]).optional(),
          nonce: z.union([z.string(), z.number()]).optional(),
          childId: z.string().optional(),
          refreshAccountId: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        throw new HatchError("invalid_body", body.error.message, 400);
      }
      const profile = profileFromRequest(req);
      const network =
        body.data.network ??
        (profile.id === "mainnet" ? "mainnet" : "testnet");
      const resolved = await resolveParentSodexAccountId({
        parentId: req.user.sub,
        wallet: req.user.wallet,
        network,
        override: body.data.accountID,
        refreshIfMissing: body.data.refreshAccountId ?? true,
      });
      const draft = draftCancelParentSign({
        accountID: resolved.accountID,
        network,
        symbolID: body.data.symbolID,
        clOrdID: body.data.clOrdID,
        orderID: body.data.orderID,
        nonce: body.data.nonce,
        childId: body.data.childId,
      });
      return {
        draft,
        accountID: resolved.accountID,
        accountIdSource: resolved.source,
        note: "UNSIGNED. Sign typedData, set apiSign on draft.relayRequest, POST /api/sodex/relay (method DELETE).",
      };
    },
  );

  app.post(
    "/api/sodex/relay",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Child tokens cannot relay", 403);
      }
      const env = getEnv();
      if (env.KILL_SWITCH) {
        throw new HatchError("kill_switch", "Trading writes halted", 503);
      }
      const allow = env.TRADING_ALLOWLIST.split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (allow.length && !allow.includes(req.user.wallet.toLowerCase())) {
        throw new HatchError("forbidden", "Wallet not on trading allowlist", 403);
      }

      await assertRelayRateLimit(req.user.wallet);

      const parsed = relaySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HatchError("invalid_body", parsed.error.message, 400);
      }
      const profile = profileFromRequest(req);
      if (!profile.writesAllowed) {
        throw new HatchError("wrong_environment", "Profile is read-only", 403);
      }

      const chainId =
        profile.id === "testnet" ? SODEX.testnet.chainId : SODEX.mainnet.chainId;

      if (parsed.data.apiKeyName && !parsed.data.apiKeyPubkey) {
        throw new HatchError(
          "invalid_body",
          "apiKeyPubkey required when apiKeyName is set (server does not custody API keys)",
          400,
        );
      }

      await assertMasterWalletSigner({
        scope: parsed.data.scope,
        chainId,
        payloadHash: parsed.data.payloadHash as Hex,
        nonce: parsed.data.apiNonce,
        apiSign: parsed.data.apiSign,
        expectedWallet: req.user.wallet,
        expectedApiKeyPubkey: parsed.data.apiKeyPubkey,
      });

      // Align draft → relay: body must hash to the signed payloadHash
      try {
        const actionType =
          parsed.data.method === "DELETE"
            ? SPOT_ACTION_BATCH_CANCEL
            : SPOT_ACTION_BATCH_NEW;
        assertRelayBodyMatchesPayloadHash({
          path: parsed.data.path,
          body: parsed.data.body,
          payloadHash: parsed.data.payloadHash,
          actionType: parsed.data.path.includes("/trade/orders/batch")
            ? actionType
            : undefined,
        });
      } catch (err) {
        throw new HatchError(
          "payload_hash_mismatch",
          err instanceof Error ? err.message : String(err),
          400,
        );
      }

      assertNotionalCap(parsed.data.body);

      // Eng test wallet on mainnet: hard 1 USDC cap (internal testing only)
      if (isEngSodexTestWallet(req.user.wallet)) {
        const notional = estimateNotionalUsd(parsed.data.body) ?? 0;
        assertMainnetTestGuard(profile.id, notional, "sodex_relay_eng_wallet");
      }

      const prisma = getPrisma();
      const envEnum =
        profile.id === "testnet"
          ? "TESTNET"
          : profile.id === "mainnet-readonly"
            ? "MAINNET_READONLY"
            : "MAINNET";

      let orderId: string | undefined;
      if (parsed.data.clOrdId && parsed.data.symbolId) {
        const row = await prisma.signedOrder.create({
          data: {
            parentId: req.user.sub,
            childId: parsed.data.childId,
            environment: envEnum,
            clOrdId: parsed.data.clOrdId,
            symbolId: parsed.data.symbolId,
            symbolName: parsed.data.symbolName ?? String(parsed.data.symbolId),
            side: parsed.data.side ?? "BUY",
            quantity: parsed.data.quantity ?? "0",
            price: parsed.data.price ?? "0",
            payloadHash: parsed.data.payloadHash,
            nonce: parsed.data.apiNonce,
            signature: parsed.data.apiSign,
            status: "PENDING",
          },
        });
        orderId = row.id;
      }

      const client = createSodexClient(profile);
      const result = await client.relay(
        parsed.data.method,
        parsed.data.path,
        parsed.data.body,
        {
          apiSign: parsed.data.apiSign,
          apiNonce: parsed.data.apiNonce,
          apiKeyName: parsed.data.apiKeyName,
        },
      );

      const parsedRelay = parseBatchRelayResponse(result.data);
      const httpOk = result.status >= 200 && result.status < 300;
      const primaryLeg =
        parsedRelay.legs.find((l) => l.clOrdID === parsed.data.clOrdId) ||
        parsedRelay.legs[0];

      let hatchStatus: "SUBMITTED" | "FAILED" | "REJECTED" = "FAILED";
      if (httpOk && parsedRelay.accepted) hatchStatus = "SUBMITTED";
      else if (httpOk && parsedRelay.topCode === 0 && primaryLeg && !primaryLeg.ok) {
        hatchStatus = "REJECTED";
      } else if (!httpOk || parsedRelay.topCode !== 0) {
        hatchStatus = "FAILED";
      }

      if (orderId) {
        await prisma.signedOrder.update({
          where: { id: orderId },
          data: {
            status: hatchStatus,
            sodexOrderId: primaryLeg?.orderID ?? null,
            sodexResponseJson: {
              httpStatus: result.status,
              relay: result.data,
              parsedLegs: parsedRelay.legs,
            } as object,
            error:
              hatchStatus === "SUBMITTED"
                ? null
                : `relay_rejected topCode=${parsedRelay.topCode} legCode=${primaryLeg?.code ?? "n/a"} HTTP ${result.status}`,
          },
        });
      }

      await prisma.systemEvent.create({
        data: {
          kind: "sodex_relay",
          payload: {
            parentId: req.user.sub,
            wallet: req.user.wallet,
            profile: profile.id,
            path: parsed.data.path,
            method: parsed.data.method,
            status: result.status,
            signedOrderId: orderId ?? null,
            sodexOrderId: primaryLeg?.orderID ?? null,
            relayAccepted: parsedRelay.accepted,
            engWallet: isEngSodexTestWallet(req.user.wallet),
            at: new Date().toISOString(),
          },
        },
      });

      let verification = null;
      if (orderId && hatchStatus === "SUBMITTED") {
        try {
          verification = await pollUntilTerminal({
            signedOrderId: orderId,
            profile,
            wallet: req.user.wallet,
            timeoutMs: 22_000,
            intervalMs: 1_500,
          });
        } catch (err) {
          verification = {
            error: err instanceof Error ? err.message : String(err),
          };
        }
        await enqueueJob("order_fill_verify", {
          signedOrderId: orderId,
          wallet: req.user.wallet,
          profileId: profile.id,
          childId: parsed.data.childId,
        });
      }

      return {
        relayed: true,
        status: result.status,
        data: result.data,
        signedOrderId: orderId,
        sodexOrderId: primaryLeg?.orderID ?? null,
        hatchStatus,
        relayAccepted: parsedRelay.accepted,
        verification,
        verified: true,
        note:
          hatchStatus === "SUBMITTED"
            ? "Relay accepted by SoDEX. Fill status comes from order history / trades — never assumed from HTTP alone."
            : "Relay was not accepted as a live order. See error / verification.",
      };
    },
  );

  app.get(
    "/api/sodex/orders/:signedOrderId/verification",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent" && req.user.role !== "child") {
        throw new HatchError("forbidden", "Auth required", 403);
      }
      const { signedOrderId } = req.params as { signedOrderId: string };
      const row = await getPrisma().signedOrder.findUnique({
        where: { id: signedOrderId },
      });
      if (!row) throw new HatchError("not_found", "Order not found", 404);
      if (req.user.role === "parent" && row.parentId !== req.user.sub) {
        throw new HatchError("forbidden", "Not your order", 403);
      }
      if (req.user.role === "child" && row.childId !== req.user.childId) {
        throw new HatchError("forbidden", "Wrong child token", 403);
      }
      const profile = profileFromRequest(req);
      const parent = await getPrisma().user.findUnique({
        where: { id: row.parentId },
      });
      if (!parent) throw new HatchError("not_found", "Parent missing", 404);
      const verification = await verifySignedOrderAgainstSodex({
        signedOrderId,
        profile,
        wallet: parent.walletAddress,
      });
      return { verification, backendTime: new Date().toISOString() };
    },
  );
}
