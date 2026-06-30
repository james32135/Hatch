import type { FastifyInstance } from "fastify";
import { getEnv } from "../config/env.js";
import { resolveProfile, PROFILES } from "../config/environment.js";
import { BASE, HATCH_CONTRACTS, SODEX_SYMBOLS, TOKENS, VALUECHAIN } from "../config/addresses.js";
import { sodexGatewayMeta } from "../clients/sodex.js";
import { getAiClient } from "../clients/ai/index.js";

export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async (req) => {
    const header = (req.headers["x-hatch-profile"] as string | undefined) ?? getEnv().HATCH_DEFAULT_PROFILE;
    const profile = resolveProfile(header);
    return {
      profile: profile.id,
      profiles: Object.keys(PROFILES),
      valuechain: VALUECHAIN,
      hatchContracts: HATCH_CONTRACTS,
      base: BASE,
      tokens: TOKENS,
      sodex: sodexGatewayMeta(profile),
      symbols: SODEX_SYMBOLS,
      custody: {
        backendOwnsSodexTradingKeys: false,
        note: "Parent signs; backend validates/relays/audits only",
      },
      aiProviders: getAiClient().listProviders().map((p) => ({
        id: p.id,
        label: p.label,
        model: p.model,
      })),
    };
  });
}
