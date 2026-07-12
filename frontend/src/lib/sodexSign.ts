/** SoDEX EIP-712 wire signature helpers (parent MetaMask → gateway). */

/** MetaMask often returns v=27|28; SoDEX expects v=0|1. */
export function normalizeEcdsaV(signature: string): string {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130) return signature.startsWith("0x") ? signature : `0x${signature}`;
  let v = Number.parseInt(raw.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  return `0x${raw.slice(0, 128)}${v.toString(16).padStart(2, "0")}`;
}

/** Canonical wire form: 0x01 + r/s/v(0|1). Does not create a new signature. */
export function toSodexWireApiSign(signature: string): string {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  let ecdsa: string;
  if (raw.length === 132 && raw.startsWith("01")) {
    ecdsa = `0x${raw.slice(2)}`;
  } else if (raw.length === 130) {
    ecdsa = `0x${raw}`;
  } else {
    throw new Error("Invalid wallet signature length for SoDEX");
  }
  return `0x01${normalizeEcdsaV(ecdsa).slice(2)}`;
}
