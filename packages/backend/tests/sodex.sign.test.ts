import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  assertMasterWalletSigner,
  payloadHashFromAction,
  sodexDomain,
  SODEX_EXCHANGE_TYPES,
  stripSodexSignPrefix,
} from "../src/services/sodexSign.js";
import { normalizeEcdsaV } from "../src/services/engSodexSigner.js";

describe("SoDEX EIP-712 verify", () => {
  it("rejects missing 0x01 prefix", () => {
    expect(() => stripSodexSignPrefix("0x" + "ab".repeat(65))).toThrow(/0x01/);
  });

  it("recovers master wallet signer for spot ExchangeAction", async () => {
    const account = privateKeyToAccount(
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    const payloadHash = payloadHashFromAction("newOrder", {
      clOrdID: "test-1",
      side: "BUY",
    });
    const nonce = BigInt(Date.now());
    const sig = await account.signTypedData({
      domain: sodexDomain("spot", 138565),
      types: SODEX_EXCHANGE_TYPES,
      primaryType: "ExchangeAction",
      message: { payloadHash, nonce },
    });
    const apiSign = `0x01${normalizeEcdsaV(sig).slice(2)}`;
    const recovered = await assertMasterWalletSigner({
      scope: "spot",
      chainId: 138565,
      payloadHash,
      nonce: nonce.toString(),
      apiSign,
      expectedWallet: account.address,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
