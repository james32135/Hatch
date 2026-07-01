/**
 * INTERNAL ENGINEERING ONLY — signs SoDEX ExchangeAction with SODEX_PRIVATE_KEY.
 * Never import into production parent trading paths.
 * Production: parents sign in-wallet; backend relays only.
 */
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  payloadHashFromAction,
  sodexDomain,
  SODEX_EXCHANGE_TYPES,
} from "./sodexSign.js";
import {
  assertMainnetTestGuard,
  MAINNET_TEST_MAX_USDC,
  MAINNET_TEST_PREFERRED_USDC,
} from "./mainnetTestGuard.js";
import { HatchError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

function engPrivateKey(): Hex {
  const raw = process.env.SODEX_PRIVATE_KEY?.replace(/^"|"$/g, "");
  if (!raw) {
    throw new HatchError(
      "eng_sodex_missing",
      "SODEX_PRIVATE_KEY not set (eng test only)",
      500,
    );
  }
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

export function engSodexAddress(): string {
  const addr = process.env.SODEX_ADDRESS?.replace(/^"|"$/g, "");
  if (!addr) {
    throw new HatchError(
      "eng_sodex_missing",
      "SODEX_ADDRESS not set (eng test only)",
      500,
    );
  }
  return addr;
}

export function engSodexAccountId(): number {
  const id = Number(process.env.SODEX_ACCOUNT_ID);
  if (!Number.isFinite(id) || id <= 0) {
    throw new HatchError(
      "eng_sodex_missing",
      "SODEX_ACCOUNT_ID not set (eng test only)",
      500,
    );
  }
  return id;
}

export async function engSignExchangeAction(input: {
  scope: "spot" | "futures";
  chainId: number;
  actionType: string;
  params: unknown;
  nonce: bigint;
  /** Required for mainnet — must be ≤ 1 USDC */
  network: "mainnet" | "testnet";
  tradeAmountUsd: number;
}): Promise<{ apiSign: string; payloadHash: Hex; nonce: string; address: string }> {
  assertMainnetTestGuard(
    input.network,
    input.tradeAmountUsd,
    "eng_sodex_signer",
  );
  if (input.network === "mainnet" && input.tradeAmountUsd > MAINNET_TEST_PREFERRED_USDC) {
    logger.warn(
      {
        tradeAmountUsd: input.tradeAmountUsd,
        preferred: MAINNET_TEST_PREFERRED_USDC,
        max: MAINNET_TEST_MAX_USDC,
      },
      "eng mainnet trade above preferred 0.20 USDC (still ≤ hard cap)",
    );
  }

  const account = privateKeyToAccount(engPrivateKey());
  const expected = engSodexAddress();
  if (account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new HatchError(
      "eng_sodex_mismatch",
      "SODEX_PRIVATE_KEY does not match SODEX_ADDRESS",
      500,
    );
  }

  const payloadHash = payloadHashFromAction(input.actionType, input.params);
  const sig = await account.signTypedData({
    domain: sodexDomain(input.scope, input.chainId),
    types: SODEX_EXCHANGE_TYPES,
    primaryType: "ExchangeAction",
    message: { payloadHash, nonce: input.nonce },
  });
  // go-ethereum SigToPub expects v in {0,1}; viem may return 27/28
  const normalized = normalizeEcdsaV(sig);
  return {
    apiSign: `0x01${normalized.slice(2)}`,
    payloadHash,
    nonce: input.nonce.toString(),
    address: account.address,
  };
}

/** Normalize ECDSA v to 0/1 for SoDEX (go-ethereum) recovery */
export function normalizeEcdsaV(signature: Hex): Hex {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130) return signature;
  let v = Number.parseInt(raw.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  return `0x${raw.slice(0, 128)}${v.toString(16).padStart(2, "0")}` as Hex;
}
