/**
 * Resolve cached per-parent SoDEX accountID (never a global platform ID).
 */
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import { createSodexClient } from "../clients/sodex.js";
import { resolveProfile, type HatchProfileId } from "../config/environment.js";
import { extractAccountId } from "./sodexSign.js";

export async function resolveParentSodexAccountId(input: {
  parentId: string;
  wallet: string;
  network: "mainnet" | "testnet";
  /** When set, skip cache and use this */
  override?: number;
  /** Refresh from SoDEX if cache miss */
  refreshIfMissing?: boolean;
}): Promise<{ accountID: number; source: "override" | "cache" | "sodex" }> {
  if (input.override && input.override > 0) {
    return { accountID: input.override, source: "override" };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: input.parentId } });
  if (!user) throw new HatchError("not_found", "Parent not found", 404);

  const cached =
    input.network === "testnet"
      ? user.sodexAccountIdTestnet
      : user.sodexAccountIdMainnet;
  if (cached && cached > 0) {
    return { accountID: cached, source: "cache" };
  }

  if (!input.refreshIfMissing) {
    throw new HatchError(
      "sodex_account_missing",
      "No cached SoDEX accountID. Call GET /api/sodex/readiness first (Enable Trading), or pass accountID.",
      400,
    );
  }

  const profileId: HatchProfileId =
    input.network === "testnet" ? "testnet" : "mainnet";
  const client = createSodexClient(resolveProfile(profileId));
  const state = await client.accountState(input.wallet);
  const accountId = extractAccountId(state);
  if (!accountId) {
    throw new HatchError(
      "sodex_account_missing",
      "SoDEX account not enabled for this wallet. Open SoDEX and Enable Trading.",
      400,
    );
  }

  await prisma.user.update({
    where: { id: input.parentId },
    data:
      input.network === "testnet"
        ? { sodexAccountIdTestnet: accountId }
        : { sodexAccountIdMainnet: accountId },
  });

  return { accountID: accountId, source: "sodex" };
}
