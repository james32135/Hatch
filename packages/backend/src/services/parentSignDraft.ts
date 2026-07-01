/**
 * Unsigned EIP-712 ExchangeAction drafts for parent wallets.
 * Backend NEVER signs — parent signs in-wallet, then POST /api/sodex/relay.
 */
import type { Hex } from "viem";
import { SODEX, SODEX_SYMBOLS } from "../config/addresses.js";
import type { AllowanceSignHandoff } from "./allowanceHandoff.js";
import { HatchError } from "../lib/errors.js";
import {
  payloadHashFromAction,
  sodexDomain,
  SODEX_EXCHANGE_TYPES,
} from "./sodexSign.js";
import {
  buildBatchCancelParams,
  buildBatchNewOrdersParams,
  SPOT_ACTION_BATCH_CANCEL,
  SPOT_ACTION_BATCH_NEW,
  SPOT_TRADE_BATCH_PATH,
  type SpotOrderSide,
  type SpotOrderType,
  type SpotTimeInForce,
} from "./spotOrders.js";

export interface ParentSignDraft {
  kind: "parent_sign_draft";
  status: "UNSIGNED";
  network: "mainnet" | "testnet";
  chainId: number;
  scope: "spot";
  path: typeof SPOT_TRADE_BATCH_PATH;
  method: "POST";
  actionType: typeof SPOT_ACTION_BATCH_NEW;
  params: ReturnType<typeof buildBatchNewOrdersParams>;
  payloadHash: Hex;
  nonce: string;
  /** Wallet signs this typed data; backend does not hold keys.
   * `message.nonce` is a decimal string on the wire — wallets must BigInt() it. */
  typedData: {
    domain: ReturnType<typeof sodexDomain>;
    types: typeof SODEX_EXCHANGE_TYPES;
    primaryType: "ExchangeAction";
    message: { payloadHash: Hex; nonce: string };
  };
  /** After wallet signs → POST /api/sodex/relay with these fields + apiSign */
  relayHints: {
    method: "POST";
    path: typeof SPOT_TRADE_BATCH_PATH;
    needApiSignPrefix: "0x01";
  };
  /**
   * Exact `/api/sodex/relay` body shape (apiSign filled by parent wallet).
   * `body` is the SoDEX params object used in payloadHash.
   */
  relayRequest: {
    method: "POST";
    path: typeof SPOT_TRADE_BATCH_PATH;
    scope: "spot";
    body: ReturnType<typeof buildBatchNewOrdersParams>;
    payloadHash: Hex;
    apiNonce: string;
    apiSign: null;
    childId: string;
    clOrdId: string;
    symbolId: number;
    symbolName: string;
    side: string;
    quantity: string;
    price: string;
  };
  legs: Array<{
    symbol: string;
    symbolID: number;
    notionalUsd: number;
    side: SpotOrderSide;
    type: SpotOrderType;
    price: string;
    quantity: string;
  }>;
  handoffRef: {
    policyId: string;
    childId: string;
    parentId: string;
    amountUsd: string;
    riskTier: string;
  };
  note: string;
}

function clOrdId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    36,
  );
}

/**
 * Size MARKET BUY qty assuming vault token ≈ 1 USDC when no mid provided.
 * With mid: LIMIT at mid, qty = notional / mid.
 */
function sizeLeg(notionalUsd: number, mid?: string): {
  type: SpotOrderType;
  timeInForce: SpotTimeInForce;
  price: string;
  quantity: string;
} {
  if (mid && Number(mid) > 0) {
    const qty = notionalUsd / Number(mid);
    return {
      type: 1,
      timeInForce: 1,
      price: mid,
      quantity: qty.toFixed(6),
    };
  }
  // MARKET IOC — qty in base ≈ USD when vault ~$1
  return {
    type: 2,
    timeInForce: 3,
    price: "0",
    quantity: notionalUsd.toFixed(6),
  };
}

export function draftAllowanceParentSign(input: {
  handoff: AllowanceSignHandoff;
  accountID: number;
  network: "mainnet" | "testnet";
  nonce?: bigint | number | string;
  mids?: { mag7?: string; ussi?: string };
}): ParentSignDraft {
  if (!Number.isFinite(input.accountID) || input.accountID <= 0) {
    throw new Error("accountID required for parent sign draft");
  }

  const chainId =
    input.network === "mainnet" ? SODEX.mainnet.chainId : SODEX.testnet.chainId;
  const nonce =
    typeof input.nonce === "bigint"
      ? input.nonce
      : BigInt(input.nonce ?? Date.now());

  const legs: ParentSignDraft["legs"] = [];
  const orderRows: Array<{
    symbolID: number;
    clOrdID: string;
    side: SpotOrderSide;
    type: SpotOrderType;
    timeInForce: SpotTimeInForce;
    price: string;
    quantity: string;
  }> = [];

  const mag7Usd = input.handoff.suggestedNotional.mag7Usd;
  if (mag7Usd > 0) {
    const sized = sizeLeg(mag7Usd, input.mids?.mag7);
    const symbolID = SODEX_SYMBOLS.vMAG7ssi_vUSDC.id;
    orderRows.push({
      symbolID,
      clOrdID: clOrdId("hm"),
      side: 1,
      ...sized,
    });
    legs.push({
      symbol: SODEX_SYMBOLS.vMAG7ssi_vUSDC.name,
      symbolID,
      notionalUsd: mag7Usd,
      side: 1,
      type: sized.type,
      price: sized.price,
      quantity: sized.quantity,
    });
  }

  const ussiUsd = input.handoff.suggestedNotional.ussiUsd;
  if (ussiUsd > 0) {
    const sized = sizeLeg(ussiUsd, input.mids?.ussi);
    const symbolID = SODEX_SYMBOLS.vUSSI_vUSDC.id;
    orderRows.push({
      symbolID,
      clOrdID: clOrdId("hu"),
      side: 1,
      ...sized,
    });
    legs.push({
      symbol: SODEX_SYMBOLS.vUSSI_vUSDC.name,
      symbolID,
      notionalUsd: ussiUsd,
      side: 1,
      type: sized.type,
      price: sized.price,
      quantity: sized.quantity,
    });
  }

  const params = buildBatchNewOrdersParams({
    accountID: input.accountID,
    orders: orderRows,
  });
  const payloadHash = payloadHashFromAction(SPOT_ACTION_BATCH_NEW, params);
  const domain = sodexDomain("spot", chainId);
  const primary = orderRows[0];

  return {
    kind: "parent_sign_draft",
    status: "UNSIGNED",
    network: input.network,
    chainId,
    scope: "spot",
    path: SPOT_TRADE_BATCH_PATH,
    method: "POST",
    actionType: SPOT_ACTION_BATCH_NEW,
    params,
    payloadHash,
    nonce: nonce.toString(),
    typedData: {
      domain,
      types: SODEX_EXCHANGE_TYPES,
      primaryType: "ExchangeAction",
      message: { payloadHash, nonce: nonce.toString() },
    },
    relayHints: {
      method: "POST",
      path: SPOT_TRADE_BATCH_PATH,
      needApiSignPrefix: "0x01",
    },
    relayRequest: {
      method: "POST",
      path: SPOT_TRADE_BATCH_PATH,
      scope: "spot",
      body: params,
      payloadHash,
      apiNonce: nonce.toString(),
      apiSign: null,
      childId: input.handoff.childId,
      clOrdId: primary?.clOrdID ?? "",
      symbolId: primary?.symbolID ?? 0,
      symbolName: legs[0]?.symbol ?? "",
      side: "BUY",
      quantity: primary?.quantity ?? "0",
      price: primary?.price ?? "0",
    },
    legs,
    handoffRef: {
      policyId: input.handoff.policyId,
      childId: input.handoff.childId,
      parentId: input.handoff.parentId,
      amountUsd: input.handoff.amountUsd,
      riskTier: input.handoff.riskTier,
    },
    note: "UNSIGNED draft only. Parent wallet signs typedData (BigInt nonce); backend never custodies keys.",
  };
}

/** Fill apiSign into draft.relayRequest for POST /api/sodex/relay */
export function relayBodyFromDraft(
  draft: ParentSignDraft | ParentCancelDraft,
  apiSign: string,
): Record<string, unknown> {
  return {
    ...draft.relayRequest,
    apiSign,
  };
}

export interface ParentCancelDraft {
  kind: "parent_cancel_draft";
  status: "UNSIGNED";
  network: "mainnet" | "testnet";
  chainId: number;
  scope: "spot";
  path: typeof SPOT_TRADE_BATCH_PATH;
  method: "DELETE";
  actionType: typeof SPOT_ACTION_BATCH_CANCEL;
  params: ReturnType<typeof buildBatchCancelParams>;
  payloadHash: Hex;
  nonce: string;
  typedData: {
    domain: ReturnType<typeof sodexDomain>;
    types: typeof SODEX_EXCHANGE_TYPES;
    primaryType: "ExchangeAction";
    message: { payloadHash: Hex; nonce: string };
  };
  relayRequest: {
    method: "DELETE";
    path: typeof SPOT_TRADE_BATCH_PATH;
    scope: "spot";
    body: ReturnType<typeof buildBatchCancelParams>;
    payloadHash: Hex;
    apiNonce: string;
    apiSign: null;
    childId?: string;
    clOrdId: string;
    symbolId: number;
  };
  note: string;
}

/** UNSIGNED cancel draft — parent signs; backend never custodies keys */
export function draftCancelParentSign(input: {
  accountID: number;
  network: "mainnet" | "testnet";
  symbolID: number;
  clOrdID: string;
  orderID?: number;
  nonce?: bigint | number | string;
  childId?: string;
}): ParentCancelDraft {
  if (!Number.isFinite(input.accountID) || input.accountID <= 0) {
    throw new Error("accountID required for cancel draft");
  }
  const chainId =
    input.network === "mainnet" ? SODEX.mainnet.chainId : SODEX.testnet.chainId;
  const nonce =
    typeof input.nonce === "bigint"
      ? input.nonce
      : BigInt(input.nonce ?? Date.now());

  const params = buildBatchCancelParams({
    accountID: input.accountID,
    symbolID: input.symbolID,
    clOrdID: input.clOrdID,
    orderID: input.orderID,
  });
  const payloadHash = payloadHashFromAction(SPOT_ACTION_BATCH_CANCEL, params);
  const domain = sodexDomain("spot", chainId);

  return {
    kind: "parent_cancel_draft",
    status: "UNSIGNED",
    network: input.network,
    chainId,
    scope: "spot",
    path: SPOT_TRADE_BATCH_PATH,
    method: "DELETE",
    actionType: SPOT_ACTION_BATCH_CANCEL,
    params,
    payloadHash,
    nonce: nonce.toString(),
    typedData: {
      domain,
      types: SODEX_EXCHANGE_TYPES,
      primaryType: "ExchangeAction",
      message: { payloadHash, nonce: nonce.toString() },
    },
    relayRequest: {
      method: "DELETE",
      path: SPOT_TRADE_BATCH_PATH,
      scope: "spot",
      body: params,
      payloadHash,
      apiNonce: nonce.toString(),
      apiSign: null,
      childId: input.childId,
      clOrdId: input.clOrdID,
      symbolId: input.symbolID,
    },
    note: "UNSIGNED cancel draft. Parent wallet signs typedData (BigInt nonce); backend never custodies keys.",
  };
}

/**
 * Ensure relay body matches the signed payloadHash for batch new/cancel.
 */
export function assertRelayBodyMatchesPayloadHash(input: {
  path: string;
  body: unknown;
  payloadHash: string;
  actionType?: string;
}): void {
  let action = input.actionType ?? null;
  if (!action && input.path.includes("/trade/orders/batch")) {
    const body = input.body as { cancels?: unknown; orders?: unknown } | null;
    action =
      body && Array.isArray(body.cancels)
        ? SPOT_ACTION_BATCH_CANCEL
        : SPOT_ACTION_BATCH_NEW;
  }
  if (!action) return;
  const expected = payloadHashFromAction(action, input.body);
  if (expected.toLowerCase() !== input.payloadHash.toLowerCase()) {
    throw new HatchError(
      "payload_hash_mismatch",
      `payloadHash mismatch: body does not match signed hash (action=${action})`,
      400,
    );
  }
}
