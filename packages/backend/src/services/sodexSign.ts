/**
 * SoDEX EIP-712 ExchangeAction verification (official domain + types).
 * Source: 02_SODEX_MASTER_REFERENCE.md §9.5–9.8, SODEX_ACCOUNT_ARCHITECTURE.md §6.6
 */
import {
  type Address,
  type Hex,
  keccak256,
  recoverTypedDataAddress,
  stringToBytes,
} from "viem";
import { HatchError } from "../lib/errors.js";

export const SODEX_EXCHANGE_TYPES = {
  ExchangeAction: [
    { name: "payloadHash", type: "bytes32" },
    { name: "nonce", type: "uint64" },
  ],
} as const;

export function sodexDomain(scope: "spot" | "futures", chainId: number) {
  return {
    name: scope,
    version: "1",
    chainId,
    verifyingContract: "0x0000000000000000000000000000000000000000" as Address,
  };
}

/** Compact JSON keccak — matches Go json.Marshal / JSON.stringify separators */
export function payloadHashFromAction(type: string, params: unknown): Hex {
  const body = JSON.stringify({ type, params });
  return keccak256(stringToBytes(body));
}

export function stripSodexSignPrefix(apiSign: string): Hex {
  const raw = apiSign.startsWith("0x") ? apiSign.slice(2) : apiSign;
  if (raw.length === 132 && raw.startsWith("01")) {
    return `0x${raw.slice(2)}` as Hex;
  }
  if (raw.length === 130) {
    throw new HatchError(
      "sig_verify_failed",
      "X-API-Sign must include 0x01 type prefix",
      401,
    );
  }
  throw new HatchError("sig_verify_failed", "Invalid X-API-Sign length", 401);
}

/** MetaMask often returns v=27|28; SoDEX wire expects v=0|1. */
export function normalizeEcdsaV(signature: Hex): Hex {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130) return signature;
  let v = Number.parseInt(raw.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  return `0x${raw.slice(0, 128)}${v.toString(16).padStart(2, "0")}` as Hex;
}

/**
 * Canonical SoDEX wire signature: 0x01 + r/s/v(0|1).
 * Always run before verify + before gateway forward so MetaMask v=27/28 cannot cause FAILED.
 */
export function toSodexWireApiSign(apiSign: string): string {
  const raw = apiSign.startsWith("0x") ? apiSign.slice(2) : apiSign;
  let ecdsa: Hex;
  if (raw.length === 132 && raw.startsWith("01")) {
    ecdsa = `0x${raw.slice(2)}` as Hex;
  } else if (raw.length === 130) {
    ecdsa = `0x${raw}` as Hex;
  } else {
    throw new HatchError("sig_verify_failed", "Invalid X-API-Sign length", 401);
  }
  return `0x01${normalizeEcdsaV(ecdsa).slice(2)}`;
}

export async function recoverExchangeSigner(input: {
  scope: "spot" | "futures";
  chainId: number;
  payloadHash: Hex;
  nonce: bigint | number | string;
  apiSign: string;
}): Promise<Address> {
  const signature = stripSodexSignPrefix(input.apiSign);
  const nonce =
    typeof input.nonce === "bigint" ? input.nonce : BigInt(input.nonce);
  return recoverTypedDataAddress({
    domain: sodexDomain(input.scope, input.chainId),
    types: SODEX_EXCHANGE_TYPES,
    primaryType: "ExchangeAction",
    message: {
      payloadHash: input.payloadHash,
      nonce,
    },
    signature,
  });
}

export async function assertMasterWalletSigner(input: {
  scope: "spot" | "futures";
  chainId: number;
  payloadHash: Hex;
  nonce: string;
  apiSign: string;
  expectedWallet: string;
  expectedApiKeyPubkey?: string;
}): Promise<Address> {
  let signer: Address;
  try {
    signer = await recoverExchangeSigner(input);
  } catch (err) {
    throw new HatchError(
      "sig_verify_failed",
      err instanceof Error ? err.message : "Signature recovery failed",
      401,
    );
  }
  const expected = (
    input.expectedApiKeyPubkey ?? input.expectedWallet
  ).toLowerCase();
  if (signer.toLowerCase() !== expected) {
    throw new HatchError(
      "sig_verify_failed",
      "Recovered signer does not match authenticated wallet",
      401,
      { signer, expected },
    );
  }
  return signer;
}

/** Extract numeric account id from SoDEX account state payloads (best-effort). */
export function extractAccountId(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const root = state as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const candidates = [data.aid, data.accountID, data.accountId, root.aid];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
    if (typeof c === "string" && /^\d+$/.test(c)) return Number(c);
  }
  return null;
}
