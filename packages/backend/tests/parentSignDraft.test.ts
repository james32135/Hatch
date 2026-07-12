import { describe, expect, it } from "vitest";
import { buildAllowanceSignHandoff } from "../src/services/allowanceHandoff.js";
import {
  allocateLegsForMinNotional,
  assertRelayBodyMatchesPayloadHash,
  draftAllowanceParentSign,
  draftCancelParentSign,
  relayBodyFromDraft,
} from "../src/services/parentSignDraft.js";
import { payloadHashFromAction } from "../src/services/sodexSign.js";
import {
  SPOT_ACTION_BATCH_CANCEL,
  SPOT_ACTION_BATCH_NEW,
} from "../src/services/spotOrders.js";
import { SODEX } from "../src/config/addresses.js";
import { HatchError } from "../src/lib/errors.js";
import type { SpotSymbolMeta } from "../src/services/sodexSymbols.js";

const mag7Testnet: SpotSymbolMeta = {
  id: 3,
  name: "vMAG7ssi_vUSDC",
  baseCoin: "vMAG7.ssi",
  minNotional: 5,
  minQuantity: 0.01,
  stepSize: 0.01,
  quantityPrecision: 2,
  status: "TRADING",
};
const ussiTestnet: SpotSymbolMeta = {
  id: 24,
  name: "vUSSI_vUSDC",
  baseCoin: "vUSSI",
  minNotional: 5,
  minQuantity: 0.01,
  stepSize: 0.01,
  quantityPrecision: 2,
  status: "TRADING",
};
const ussiMainnet: SpotSymbolMeta = { ...ussiTestnet, id: 26 };

describe("parent sign draft (unsigned)", () => {
  it("builds EIP-712 typed data without signing", () => {
    const handoff = buildAllowanceSignHandoff({
      policyId: "pol",
      childId: "c",
      parentId: "p",
      amountUsd: 10,
      riskTier: "BALANCED",
    });
    const draft = draftAllowanceParentSign({
      handoff,
      accountID: 54647,
      network: "testnet",
      nonce: 42n,
      symbols: { mag7: mag7Testnet, ussi: ussiTestnet },
      mids: { mag7: "0.42", ussi: "1.00" },
    });
    expect(draft.status).toBe("UNSIGNED");
    expect(draft.kind).toBe("parent_sign_draft");
    expect(draft.chainId).toBe(SODEX.testnet.chainId);
    expect(draft.legs).toHaveLength(2);
    expect(draft.params.orders).toHaveLength(2);
    expect(draft.params.orders[0]?.symbolID).toBe(3);
    expect(draft.params.orders[1]?.symbolID).toBe(24);
    expect(draft.params.accountID).toBe(54647);
    expect(draft.typedData.primaryType).toBe("ExchangeAction");
    expect(draft.typedData.message.nonce).toBe("42");
    expect(draft.payloadHash).toBe(
      payloadHashFromAction(SPOT_ACTION_BATCH_NEW, draft.params),
    );
    expect(draft.relayRequest.body).toEqual(draft.params);
    expect(draft.relayRequest.payloadHash).toBe(draft.payloadHash);
    expect(draft.relayRequest.apiSign).toBeNull();
    expect(draft.note).toMatch(/never custodies/i);
  });

  it("rejects allowance below SoDEX minNotional", () => {
    const handoff = buildAllowanceSignHandoff({
      policyId: "pol",
      childId: "c",
      parentId: "p",
      amountUsd: 2,
      riskTier: "BALANCED",
    });
    expect(() =>
      draftAllowanceParentSign({
        handoff,
        accountID: 1,
        network: "testnet",
        symbols: { mag7: mag7Testnet, ussi: ussiTestnet },
        mids: { mag7: "0.42", ussi: "1.00" },
      }),
    ).toThrow(/minNotional/i);
  });

  it("collapses dual legs when only one meets minNotional", () => {
    const legs = allocateLegsForMinNotional({
      mag7Usd: 4,
      ussiUsd: 4,
      mag7: mag7Testnet,
      ussi: ussiTestnet,
    });
    expect(legs).toHaveLength(1);
    expect(legs[0]?.notionalUsd).toBe(8);
  });

  it("relayBodyFromDraft fills apiSign aligned with schema", () => {
    const handoff = buildAllowanceSignHandoff({
      policyId: "pol",
      childId: "c",
      parentId: "p",
      amountUsd: 10,
      riskTier: "BALANCED",
    });
    const draft = draftAllowanceParentSign({
      handoff,
      accountID: 1,
      network: "testnet",
      nonce: 1n,
      symbols: { mag7: mag7Testnet, ussi: ussiTestnet },
      mids: { mag7: "0.42", ussi: "1.00" },
    });
    const body = relayBodyFromDraft(draft, "0x01dead");
    expect(body.apiSign).toBe("0x01dead");
    expect(body.path).toBe(draft.path);
    expect(body.body).toEqual(draft.params);
    assertRelayBodyMatchesPayloadHash({
      path: String(body.path),
      body: body.body,
      payloadHash: String(body.payloadHash),
      actionType: SPOT_ACTION_BATCH_NEW,
    });
  });

  it("rejects tampered relay body", () => {
    const handoff = buildAllowanceSignHandoff({
      policyId: "pol",
      childId: "c",
      parentId: "p",
      amountUsd: 10,
      riskTier: "BALANCED",
    });
    const draft = draftAllowanceParentSign({
      handoff,
      accountID: 1,
      network: "testnet",
      nonce: 1n,
      symbols: { mag7: mag7Testnet, ussi: ussiTestnet },
      mids: { mag7: "0.42", ussi: "1.00" },
    });
    expect(() =>
      assertRelayBodyMatchesPayloadHash({
        path: draft.path,
        body: { ...draft.params, accountID: 999 },
        payloadHash: draft.payloadHash,
        actionType: SPOT_ACTION_BATCH_NEW,
      }),
    ).toThrow(HatchError);
  });

  it("builds UNSIGNED cancel draft aligned with relay", () => {
    const draft = draftCancelParentSign({
      accountID: 54647,
      network: "testnet",
      symbolID: 1,
      clOrdID: "hatchcancel1",
      orderID: 99,
      nonce: 7n,
    });
    expect(draft.kind).toBe("parent_cancel_draft");
    expect(draft.method).toBe("DELETE");
    expect(draft.actionType).toBe(SPOT_ACTION_BATCH_CANCEL);
    expect(draft.payloadHash).toBe(
      payloadHashFromAction(SPOT_ACTION_BATCH_CANCEL, draft.params),
    );
    assertRelayBodyMatchesPayloadHash({
      path: draft.path,
      body: draft.params,
      payloadHash: draft.payloadHash,
    });
    const body = relayBodyFromDraft(draft, "0x01ab");
    expect(body.method).toBe("DELETE");
    expect(body.apiSign).toBe("0x01ab");
  });

  it("uses LIMIT sizing when mids provided", () => {
    const handoff = buildAllowanceSignHandoff({
      policyId: "pol",
      childId: "c",
      parentId: "p",
      amountUsd: 10,
      riskTier: "GROWTH",
    });
    const draft = draftAllowanceParentSign({
      handoff,
      accountID: 1,
      network: "mainnet",
      symbols: { mag7: mag7Testnet, ussi: ussiMainnet },
      mids: { mag7: "1.00", ussi: "1.00" },
    });
    expect(draft.legs.every((l) => l.type === 1)).toBe(true);
    expect(draft.legs[0]?.price).toBe("1.0000");
  });
});
