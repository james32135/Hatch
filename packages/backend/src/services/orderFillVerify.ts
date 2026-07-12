/**
 * Post-relay fill verification against official SoDEX account APIs.
 * Official docs:
 * - POST /trade/orders/batch → { code, data:[{ code, clOrdID, orderID }] }
 * - GET /accounts/{addr}/orders/history (status FILLED=3 etc.)
 * - GET /accounts/{addr}/trades
 * - GET /accounts/{addr}/balances + /state
 * Schema OrderStatus: NEW=1 PARTIALLY_FILLED=2 FILLED=3 CANCELED=4 REJECTED=5 EXPIRED=6
 * Source: https://sodex.com/documentation/trading-api/rest-v1/schema.md
 */
import type { HatchProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import { getPrisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { enqueueJob } from "../jobs/queue.js";

export type SodexOrderStatusString =
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED"
  | "UNKNOWN";

const TERMINAL = new Set([
  "FILLED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
  "PARTIALLY_FILLED",
]);

export function mapOrderStatus(raw: unknown): SodexOrderStatusString {
  if (typeof raw === "number") {
    const m: Record<number, SodexOrderStatusString> = {
      1: "NEW",
      2: "PARTIALLY_FILLED",
      3: "FILLED",
      4: "CANCELED",
      5: "REJECTED",
      6: "EXPIRED",
    };
    return m[raw] ?? "UNKNOWN";
  }
  const s = String(raw || "").toUpperCase();
  if (
    [
      "NEW",
      "PARTIALLY_FILLED",
      "FILLED",
      "CANCELED",
      "REJECTED",
      "EXPIRED",
    ].includes(s)
  ) {
    return s as SodexOrderStatusString;
  }
  return "UNKNOWN";
}

export type RelayLegResult = {
  clOrdID: string;
  orderID: string | null;
  code: number | null;
  ok: boolean;
};

export function parseBatchRelayResponse(data: unknown): {
  topCode: number | null;
  legs: RelayLegResult[];
  accepted: boolean;
} {
  if (!data || typeof data !== "object") {
    return { topCode: null, legs: [], accepted: false };
  }
  const root = data as Record<string, unknown>;
  const topCode =
    typeof root.code === "number"
      ? root.code
      : root.code != null
        ? Number(root.code)
        : null;
  const rows = Array.isArray(root.data) ? root.data : [];
  const legs: RelayLegResult[] = rows.map((row) => {
    const r = (row && typeof row === "object" ? row : {}) as Record<
      string,
      unknown
    >;
    const code =
      typeof r.code === "number"
        ? r.code
        : r.code != null
          ? Number(r.code)
          : null;
    const orderID =
      r.orderID != null
        ? String(r.orderID)
        : r.orderId != null
          ? String(r.orderId)
          : null;
    return {
      clOrdID: String(r.clOrdID ?? r.clOrdId ?? ""),
      orderID,
      code,
      ok: code === 0 && !!orderID,
    };
  });
  const accepted = topCode === 0 && legs.some((l) => l.ok);
  return { topCode, legs, accepted };
}

function hatchStatusFromSodex(
  st: SodexOrderStatusString,
): "SUBMITTED" | "FILLED" | "PARTIAL" | "REJECTED" | "FAILED" {
  if (st === "FILLED") return "FILLED";
  if (st === "PARTIALLY_FILLED") return "PARTIAL";
  if (st === "REJECTED" || st === "EXPIRED" || st === "CANCELED")
    return "REJECTED";
  if (st === "NEW") return "SUBMITTED";
  return "SUBMITTED";
}

export type OrderVerification = {
  signedOrderId: string;
  clOrdId: string;
  sodexOrderId: string | null;
  hatchStatus: string;
  sodexStatus: SodexOrderStatusString | null;
  executionStatus: string;
  filledQty: string | null;
  filledValue: string | null;
  filledPrice: string | null;
  tradeIds: string[];
  trades: unknown[];
  orderHistoryRow: unknown | null;
  balances: unknown;
  accountState: unknown;
  openOrders: unknown;
  lastSyncAt: string;
  mismatches: string[];
  sodexAppUrl: string;
  waitingForMatch: boolean;
  protocolNote: string;
};

function unwrapDataArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const o = payload as Record<string, unknown>;
  if (Array.isArray(o.data)) return o.data;
  if (o.data && typeof o.data === "object") {
    const d = o.data as Record<string, unknown>;
    if (Array.isArray(d.orders)) return d.orders;
    if (Array.isArray(d.trades)) return d.trades;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

export async function verifySignedOrderAgainstSodex(input: {
  signedOrderId: string;
  profile: HatchProfile;
  wallet: string;
}): Promise<OrderVerification> {
  const prisma = getPrisma();
  const row = await prisma.signedOrder.findUnique({
    where: { id: input.signedOrderId },
  });
  if (!row) {
    throw new Error(`signedOrder ${input.signedOrderId} not found`);
  }

  const sodex = createSodexClient(input.profile);
  const addr = input.wallet.toLowerCase();

  const [historyRaw, tradesRaw, balances, accountState, openOrders] =
    await Promise.all([
      sodex.orderHistory(addr, { limit: 100 }),
      sodex.userTrades(addr, {
        limit: 100,
        orderID: row.sodexOrderId ? Number(row.sodexOrderId) : undefined,
      }),
      sodex.accountBalances(addr),
      sodex.accountState(addr),
      sodex.openOrders(addr),
    ]);

  const history = unwrapDataArray(historyRaw);
  const tradesAll = unwrapDataArray(tradesRaw);

  const byClOrd = history.find((h) => {
    const o = h as Record<string, unknown>;
    return String(o.clOrdID ?? o.clOrdId ?? "") === row.clOrdId;
  });
  const byOrderId =
    row.sodexOrderId &&
    history.find((h) => {
      const o = h as Record<string, unknown>;
      return String(o.orderID ?? o.orderId ?? "") === row.sodexOrderId;
    });
  const orderRow = (byClOrd || byOrderId || null) as Record<
    string,
    unknown
  > | null;

  const sodexStatus = orderRow
    ? mapOrderStatus(orderRow.status)
    : null;

  const trades = tradesAll.filter((t) => {
    const o = t as Record<string, unknown>;
    if (row.sodexOrderId && String(o.orderID ?? "") === row.sodexOrderId)
      return true;
    if (String(o.clOrdID ?? o.clOrdId ?? "") === row.clOrdId) return true;
    return false;
  });

  const tradeIds = trades
    .map((t) => String((t as Record<string, unknown>).tradeID ?? ""))
    .filter(Boolean);

  let filledQty =
    orderRow?.executedQty != null ? String(orderRow.executedQty) : null;
  let filledValue =
    orderRow?.executedValue != null ? String(orderRow.executedValue) : null;
  let filledPrice: string | null =
    orderRow?.price != null && Number(orderRow.price) > 0
      ? String(orderRow.price)
      : null;

  if (trades.length && (!filledQty || Number(filledQty) === 0)) {
    let q = 0;
    let v = 0;
    for (const t of trades) {
      const o = t as Record<string, unknown>;
      q += Number(o.quantity ?? 0);
      v += Number(o.price ?? 0) * Number(o.quantity ?? 0);
    }
    filledQty = String(q);
    filledValue = String(v);
    if (q > 0) filledPrice = String(v / q);
  }

  const mismatches: string[] = [];
  if (!orderRow && row.status === "SUBMITTED") {
    mismatches.push(
      "Order not yet in SoDEX order history — waiting for matching / settlement",
    );
  }
  if (sodexStatus === "EXPIRED" || sodexStatus === "CANCELED") {
    mismatches.push(
      `SoDEX terminal status ${sodexStatus} with executedQty=${filledQty ?? "0"} — no fill credited`,
    );
  }
  if (sodexStatus === "REJECTED") {
    mismatches.push("SoDEX rejected the order");
  }
  if (
    sodexStatus === "FILLED" &&
    (!filledQty || Number(filledQty) <= 0)
  ) {
    mismatches.push("FILLED status but executedQty is zero");
  }

  // Persist hatch status from protocol
  if (sodexStatus && TERMINAL.has(sodexStatus)) {
    const next = hatchStatusFromSodex(sodexStatus);
    const sodexOrderId =
      row.sodexOrderId ||
      (orderRow?.orderID != null ? String(orderRow.orderID) : null);
    await prisma.signedOrder.update({
      where: { id: row.id },
      data: {
        status: next,
        sodexOrderId: sodexOrderId ?? undefined,
        sodexResponseJson: {
          ...(typeof row.sodexResponseJson === "object" &&
          row.sodexResponseJson
            ? (row.sodexResponseJson as object)
            : {}),
          verification: {
            sodexStatus,
            filledQty,
            filledValue,
            filledPrice,
            tradeIds,
            orderHistoryRow: orderRow,
            verifiedAt: new Date().toISOString(),
            mismatches,
          },
        } as object,
        error:
          next === "REJECTED" || next === "FAILED"
            ? `SoDEX ${sodexStatus}`
            : null,
      },
    });

    if (next === "FILLED" || next === "PARTIAL") {
      await enqueueJob("portfolio_sync", {
        trigger: "order_filled",
        childId: row.childId,
        signedOrderId: row.id,
      });
      if (row.childId) {
        await enqueueJob("lesson_generation", { childId: row.childId });
      }
    }
  }

  const refreshed = await prisma.signedOrder.findUnique({
    where: { id: row.id },
  });

  const waitingForMatch =
    !sodexStatus ||
    sodexStatus === "NEW" ||
    sodexStatus === "UNKNOWN" ||
    (refreshed?.status === "SUBMITTED" && !TERMINAL.has(sodexStatus ?? ""));

  return {
    signedOrderId: row.id,
    clOrdId: row.clOrdId,
    sodexOrderId: refreshed?.sodexOrderId ?? row.sodexOrderId,
    hatchStatus: refreshed?.status ?? row.status,
    sodexStatus,
    executionStatus: sodexStatus ?? (waitingForMatch ? "WAITING_FOR_MATCH" : "UNKNOWN"),
    filledQty,
    filledValue,
    filledPrice,
    tradeIds,
    trades,
    orderHistoryRow: orderRow,
    balances,
    accountState,
    openOrders,
    lastSyncAt: new Date().toISOString(),
    mismatches,
    sodexAppUrl: sodex.appUrl,
    waitingForMatch,
    protocolNote:
      "Path A buys SoDEX vault tokens (vMAG7.ssi / vUSSI on ValueChain). Base SSI site (ssi.sosovalue.com) does not auto-update from SoDEX fills — HATCH portfolio must match SoDEX balances/trades.",
  };
}

/** Poll until terminal or timeout. */
export async function pollUntilTerminal(input: {
  signedOrderId: string;
  profile: HatchProfile;
  wallet: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<OrderVerification> {
  const timeoutMs = input.timeoutMs ?? 25_000;
  const intervalMs = input.intervalMs ?? 1_500;
  const start = Date.now();
  let last = await verifySignedOrderAgainstSodex(input);
  while (Date.now() - start < timeoutMs) {
    if (
      last.sodexStatus &&
      TERMINAL.has(last.sodexStatus) &&
      last.sodexStatus !== "PARTIALLY_FILLED"
    ) {
      return last;
    }
    if (last.sodexStatus === "FILLED" || last.hatchStatus === "FILLED") {
      return last;
    }
    if (last.sodexStatus === "PARTIALLY_FILLED" && Date.now() - start > 8_000) {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await verifySignedOrderAgainstSodex(input);
  }
  logger.info(
    { signedOrderId: input.signedOrderId, status: last.executionStatus },
    "fill poll timeout — leaving SUBMITTED / waiting",
  );
  return last;
}
