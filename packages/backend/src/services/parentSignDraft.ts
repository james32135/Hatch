/**
 * Unsigned EIP-712 ExchangeAction drafts for parent wallets.
 * Backend NEVER signs — parent signs in-wallet, then POST /api/sodex/relay.
 *
 * Sizing rules (from live SoDEX markets/symbols):
 * - Use network-specific symbol IDs (testnet vUSSI=24, mainnet vUSSI=26).
 * - Respect minNotional (MAG7/USSI = $5 on both nets as of 2026-07-12).
 * - Prefer live mid from /markets/tickers; else fail closed (no invented qty).
 */
import type { Hex } from "viem";
import { SODEX } from "../config/addresses.js";
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
import {
  formatDecimal,
  formatPrice,
  getStepSize,
  type SpotSymbolMeta,
} from "./sodexSymbols.js";
import type { ExecutionRoute } from "./marketLiquidity.js";

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
  typedData: {
    domain: ReturnType<typeof sodexDomain>;
    types: typeof SODEX_EXCHANGE_TYPES;
    primaryType: "ExchangeAction";
    message: { payloadHash: Hex; nonce: string };
  };
  relayHints: {
    method: "POST";
    path: typeof SPOT_TRADE_BATCH_PATH;
    needApiSignPrefix: "0x01";
  };
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
    route?: {
      why: string;
      symbol: string;
      marketId: number;
      bestAsk: number | null;
      askDepthUsd: number;
      score: number;
      maxSlippageBps: number;
      referenceAsk: number | null;
      scannedAt: string;
      considered: unknown[];
    };
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
  sizingNote: string;
  note: string;
  /** Liquidity-aware route decision (official books). */
  route?: {
    why: string;
    symbol: string;
    marketId: number;
    bestAsk: number | null;
    askDepthUsd: number;
    score: number;
    maxSlippageBps: number;
    referenceAsk: number;
    scannedAt: string;
    considered: ExecutionRoute["considered"];
  };
}

function clOrdId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    36,
  );
}

function sizeLimitBuy(notionalUsd: number, mid: number, meta: SpotSymbolMeta): {
  type: SpotOrderType;
  timeInForce: SpotTimeInForce;
  price: string;
  quantity: string;
} {
  if (!(mid > 0)) {
    throw new HatchError(
      "unavailable",
      `No live mid for ${meta.name} — cannot size order without inventing a price`,
      502,
    );
  }
  if (notionalUsd + 1e-9 < meta.minNotional) {
    throw new HatchError(
      "notional_too_small",
      `SoDEX requires minNotional $${meta.minNotional} for ${meta.name}. This leg is $${notionalUsd.toFixed(2)}. Raise the weekly allowance or invest a single leg ≥ $${meta.minNotional}.`,
      400,
    );
  }
  const step = getStepSize(meta);
  // Round UP so lot-size never drops under minNotional
  const rawQty = Math.max(notionalUsd / mid, meta.minNotional / mid);
  const stepped = Math.ceil(rawQty / step - 1e-12) * step;
  if (stepped < meta.minQuantity) {
    throw new HatchError(
      "notional_too_small",
      `Quantity ${stepped} below SoDEX minQuantity ${meta.minQuantity} for ${meta.name}`,
      400,
    );
  }
  // Reference formatDecimal (round mode) after ceil — strips trailing zeros
  const quantity = formatDecimal(stepped, step, "round");
  const notionalCheck = Number(quantity) * mid;
  if (notionalCheck + 1e-9 < meta.minNotional) {
    throw new HatchError(
      "notional_too_small",
      `After lot-size rounding, notional $${notionalCheck.toFixed(4)} is below SoDEX minNotional $${meta.minNotional} for ${meta.name}`,
      400,
    );
  }
  // LIMIT IOC at mid — SoDEX-accepted price string (no toFixed padding)
  return {
    type: 1,
    timeInForce: 3,
    price: formatPrice(mid, meta),
    quantity,
  };
}

/**
 * Allocate allowance across MAG7/USSI respecting SoDEX minNotional.
 * If total < minNotional → error.
 * If total < 2×minNotional → single dominant leg (never invent two sub-min legs).
 */
export function allocateLegsForMinNotional(input: {
  mag7Usd: number;
  ussiUsd: number;
  mag7: SpotSymbolMeta;
  ussi: SpotSymbolMeta;
}): Array<{ meta: SpotSymbolMeta; notionalUsd: number; kind: "mag7" | "ussi" }> {
  const total = input.mag7Usd + input.ussiUsd;
  const minNeed = Math.max(input.mag7.minNotional, input.ussi.minNotional);
  if (total + 1e-9 < minNeed) {
    throw new HatchError(
      "notional_too_small",
      `SoDEX minNotional is $${minNeed} for MAG7/USSI. Weekly allowance $${total.toFixed(2)} is too small to place a fillable order. Set allowance to at least $${minNeed}.`,
      400,
    );
  }

  const bothOk =
    input.mag7Usd + 1e-9 >= input.mag7.minNotional &&
    input.ussiUsd + 1e-9 >= input.ussi.minNotional;

  if (bothOk) {
    return [
      { meta: input.mag7, notionalUsd: input.mag7Usd, kind: "mag7" },
      { meta: input.ussi, notionalUsd: input.ussiUsd, kind: "ussi" },
    ];
  }

  // Collapse into the larger intended sleeve (or USSI if equal)
  if (input.mag7Usd >= input.ussiUsd) {
    return [{ meta: input.mag7, notionalUsd: total, kind: "mag7" }];
  }
  return [{ meta: input.ussi, notionalUsd: total, kind: "ussi" }];
}

export function draftAllowanceParentSign(input: {
  handoff: AllowanceSignHandoff;
  accountID: number;
  network: "mainnet" | "testnet";
  nonce?: bigint | number | string;
  symbols: { mag7: SpotSymbolMeta; ussi: SpotSymbolMeta };
  mids: { mag7?: string; ussi?: string };
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

  const planned = allocateLegsForMinNotional({
    mag7Usd: input.handoff.suggestedNotional.mag7Usd,
    ussiUsd: input.handoff.suggestedNotional.ussiUsd,
    mag7: input.symbols.mag7,
    ussi: input.symbols.ussi,
  });

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

  for (const leg of planned) {
    const midStr = leg.kind === "mag7" ? input.mids.mag7 : input.mids.ussi;
    const mid = midStr ? Number(midStr) : NaN;
    const sized = sizeLimitBuy(leg.notionalUsd, mid, leg.meta);
    const prefix = leg.kind === "mag7" ? "hm" : "hu";
    orderRows.push({
      symbolID: leg.meta.id,
      clOrdID: clOrdId(prefix),
      side: 1,
      ...sized,
    });
    legs.push({
      symbol: leg.meta.name,
      symbolID: leg.meta.id,
      notionalUsd: leg.notionalUsd,
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

  const sizingNote =
    planned.length === 1
      ? `Single leg ${planned[0].meta.name} @ $${planned[0].notionalUsd.toFixed(2)} (SoDEX minNotional enforced; dual-leg collapsed).`
      : `Dual leg sized to live SoDEX minNotional + mid.`;

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
    sizingNote,
    note: "UNSIGNED draft only. Parent wallet signs typedData (BigInt nonce); backend never custodies keys. Fill verified via SoDEX order history + trades after relay.",
  };
}

/**
 * Liquidity-aware single-leg draft from selectExecutionRoute().
 * Prefer Path A indices when they have asks; otherwise highest-score executable market.
 */
export function draftRoutedParentSign(input: {
  handoff: AllowanceSignHandoff;
  accountID: number;
  network: "mainnet" | "testnet";
  nonce?: bigint | number | string;
  route: ExecutionRoute;
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

  const { route } = input;
  const clOrdID = clOrdId("hx");
  const orderRows = [
    {
      symbolID: route.market.marketId,
      clOrdID,
      side: 1 as SpotOrderSide,
      type: 1 as SpotOrderType,
      timeInForce: 3 as SpotTimeInForce,
      price: route.limitPrice,
      quantity: route.quantity,
    },
  ];
  const legs: ParentSignDraft["legs"] = [
    {
      symbol: route.market.symbol,
      symbolID: route.market.marketId,
      notionalUsd: route.notionalUsd,
      side: 1,
      type: 1,
      price: route.limitPrice,
      quantity: route.quantity,
    },
  ];
  const params = buildBatchNewOrdersParams({
    accountID: input.accountID,
    orders: orderRows,
  });
  const payloadHash = payloadHashFromAction(SPOT_ACTION_BATCH_NEW, params);
  const domain = sodexDomain("spot", chainId);
  const primary = orderRows[0]!;

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
      clOrdId: primary.clOrdID,
      symbolId: primary.symbolID,
      symbolName: route.market.symbol,
      side: "BUY",
      quantity: primary.quantity,
      price: primary.price,
      // Persisted on SignedOrder for reproducible execution evidence
      route: {
        why: route.why,
        symbol: route.market.symbol,
        marketId: route.market.marketId,
        bestAsk: route.market.bestAsk,
        askDepthUsd: route.market.askDepthUsd,
        score: route.market.score,
        maxSlippageBps: route.maxSlippageBps,
        referenceAsk: route.referenceAsk,
        scannedAt: route.scannedAt,
        considered: route.considered,
      },
    },
    legs,
    handoffRef: {
      policyId: input.handoff.policyId,
      childId: input.handoff.childId,
      parentId: input.handoff.parentId,
      amountUsd: input.handoff.amountUsd,
      riskTier: input.handoff.riskTier,
    },
    sizingNote: `Liquidity route → ${route.market.symbol} @ limit ${route.limitPrice} (ask ${route.referenceAsk}, slip ${route.maxSlippageBps}bps). ${route.why}`,
    note: "UNSIGNED draft. Liquidity-aware: never submits into empty ask books. Parent signs; fills verified via SoDEX history + trades.",
    route: {
      why: route.why,
      symbol: route.market.symbol,
      marketId: route.market.marketId,
      bestAsk: route.market.bestAsk,
      askDepthUsd: route.market.askDepthUsd,
      score: route.market.score,
      maxSlippageBps: route.maxSlippageBps,
      referenceAsk: route.referenceAsk,
      scannedAt: route.scannedAt,
      considered: route.considered,
    },
  };
}

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
