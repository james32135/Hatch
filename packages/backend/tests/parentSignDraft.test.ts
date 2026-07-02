import { describe, expect, it } from "vitest";
import { buildAllowanceSignHandoff } from "../src/services/allowanceHandoff.js";
import {
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
    });
    expect(draft.status).toBe("UNSIGNED");
    expect(draft.kind).toBe("parent_sign_draft");
    expect(draft.chainId).toBe(SODEX.testnet.chainId);
    expect(draft.legs).toHaveLength(2);
    expect(draft.params.orders).toHaveLength(2);
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
      mids: { mag7: "1.00", ussi: "1.00" },
    });
    expect(draft.legs.every((l) => l.type === 1)).toBe(true);
    expect(draft.legs[0]?.price).toBe("1.00");
  });
});
