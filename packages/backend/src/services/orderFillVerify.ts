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

function hatchStatusFromProtocol(
  st: SodexOrderStatusString,
): "SUBMITTED" | "FILLED" | "PARTIAL" | "REJECTED" | "FAILED" {
  if (st === "FILLED") return "FILLED";
  if (st === "PARTIALLY_FILLED") return "PARTIAL";
  if (st === "REJECTED" || st === "EXPIRED" || st === "CANCELED")
    return "REJECTED";
  if (st === "NEW") return "SUBMITTED";
  return "SUBMITTED";
}

// retained for clarity in audits — fill path uses assertFillEvidence instead
void hatchStatusFromProtocol;

function unwrapBalances(payload: unknown): Array<Record<string, unknown>> {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as Array<Record<string, unknown>>;
    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (Array.isArray(d.balances)) return d.balances as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function coinTotal(balances: unknown, coinHint: string): number {
  const rows = unwrapBalances(balances);
  const hint = coinHint.toUpperCase().replace(/^V/, "");
  let best = 0;
  for (const r of rows) {
    const coin = String(r.coin ?? r.asset ?? r.symbol ?? "").toUpperCase();
    if (!coin) continue;
    if (
      coin === coinHint.toUpperCase() ||
      coin === hint ||
      coin.replace(/^V/, "") === hint ||
      coin.includes(hint)
    ) {
      const total = Number(r.total ?? r.free ?? r.available ?? 0);
      if (Number.isFinite(total) && total > best) best = total;
    }
  }
  return best;
}

/**
 * FILLED only when protocol evidence is complete:
 * executedQty > 0 AND at least one trade AND (when possible) base balance increased.
 */
function assertFillEvidence(input: {
  sodexStatus: SodexOrderStatusString | null;
  filledQty: string | null;
  tradeIds: string[];
  symbolName: string;
  balancesBefore: unknown;
  balancesAfter: unknown;
}): {
  hatchStatus: "FILLED" | "PARTIAL" | "REJECTED" | "SUBMITTED" | null;
  mismatches: string[];
  balanceChanged: boolean;
  fillProven: boolean;
} {
  const mismatches: string[] = [];
  const qty = Number(input.filledQty ?? 0);
  const hasTrade = input.tradeIds.length > 0;
  const baseHint = String(input.symbolName || "").split("_")[0] || "";
  const before = coinTotal(input.balancesBefore, baseHint);
  const after = coinTotal(input.balancesAfter, baseHint);
  const balanceChanged =
    input.balancesBefore != null && after + 1e-12 > before;

  if (input.sodexStatus === "FILLED" || input.sodexStatus === "PARTIALLY_FILLED") {
    if (!(qty > 0)) mismatches.push("status claims fill but executedQty is zero");
    if (!hasTrade) mismatches.push("status claims fill but no trade in SoDEX trade history");
    if (input.balancesBefore != null && !balanceChanged) {
      mismatches.push(
        `status claims fill but ${baseHint || "base"} balance did not increase (before=${before}, after=${after})`,
      );
    }
  }

  if (input.sodexStatus === "EXPIRED" || input.sodexStatus === "CANCELED") {
    mismatches.push(
      `SoDEX terminal status ${input.sodexStatus} with executedQty=${input.filledQty ?? "0"} — no fill credited`,
    );
    return {
      hatchStatus: qty > 0 && hasTrade ? (input.sodexStatus === "CANCELED" && qty > 0 ? "PARTIAL" : "REJECTED") : "REJECTED",
      mismatches,
      balanceChanged,
      fillProven: false,
    };
  }
  if (input.sodexStatus === "REJECTED") {
    mismatches.push("SoDEX rejected the order");
    return { hatchStatus: "REJECTED", mismatches, balanceChanged, fillProven: false };
  }

  const fillProven =
    qty > 0 &&
    hasTrade &&
    (input.balancesBefore == null || balanceChanged);

  if (input.sodexStatus === "FILLED") {
    if (fillProven) {
      return { hatchStatus: "FILLED", mismatches, balanceChanged, fillProven: true };
    }
    mismatches.push("FILLED withheld — missing executedQty, trade, or balance delta");
    return { hatchStatus: "SUBMITTED", mismatches, balanceChanged, fillProven: false };
  }
  if (input.sodexStatus === "PARTIALLY_FILLED") {
    if (fillProven) {
      return { hatchStatus: "PARTIAL", mismatches, balanceChanged, fillProven: true };
    }
    return { hatchStatus: "SUBMITTED", mismatches, balanceChanged, fillProven: false };
  }
  if (input.sodexStatus === "NEW") {
    return { hatchStatus: "SUBMITTED", mismatches, balanceChanged, fillProven: false };
  }
  return { hatchStatus: null, mismatches, balanceChanged, fillProven: false };
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
  fillEvidence?: {
    executedQty: number;
    tradeCount: number;
    balanceChanged: boolean;
    fillProven: boolean;
  };
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

  const prevJson =
    typeof row.sodexResponseJson === "object" && row.sodexResponseJson
      ? (row.sodexResponseJson as Record<string, unknown>)
      : {};
  const balancesBefore = prevJson.balancesBefore ?? null;

  const evidence = assertFillEvidence({
    sodexStatus,
    filledQty,
    tradeIds,
    symbolName: row.symbolName,
    balancesBefore,
    balancesAfter: balances,
  });
  mismatches.push(...evidence.mismatches);

  // Persist hatch status only from protocol evidence — never from relay HTTP alone
  if (sodexStatus && TERMINAL.has(sodexStatus)) {
    const next =
      evidence.hatchStatus ??
      (sodexStatus === "CANCELED" ||
      sodexStatus === "EXPIRED" ||
      sodexStatus === "REJECTED"
        ? "REJECTED"
        : "SUBMITTED");
    const sodexOrderId =
      row.sodexOrderId ||
      (orderRow?.orderID != null ? String(orderRow.orderID) : null);
    await prisma.signedOrder.update({
      where: { id: row.id },
      data: {
        status: next,
        sodexOrderId: sodexOrderId ?? undefined,
        sodexResponseJson: {
          ...prevJson,
          verification: {
            sodexStatus,
            filledQty,
            filledValue,
            filledPrice,
            tradeIds,
            orderHistoryRow: orderRow,
            verifiedAt: new Date().toISOString(),
            mismatches,
            fillEvidence: {
              executedQty: Number(filledQty ?? 0),
              tradeCount: tradeIds.length,
              balanceChanged: evidence.balanceChanged,
              fillProven: evidence.fillProven,
            },
          },
        } as object,
        error: next === "REJECTED" ? `SoDEX ${sodexStatus}` : null,
      },
    });

    if (
      (next === "FILLED" || next === "PARTIAL") &&
      evidence.fillProven
    ) {
      await enqueueJob("portfolio_sync", {
        trigger: "order_filled",
        childId: row.childId,
        signedOrderId: row.id,
        profileId: input.profile.id,
        triggerDelta: Number(filledValue ?? 0) || undefined,
      });
      if (row.childId) {
        const delta = Number(filledValue ?? 0);
        if (Number.isFinite(delta) && Math.abs(delta) >= 0.01) {
          await enqueueJob("lesson_generation", {
            childId: row.childId,
            triggerDelta: delta,
            asset: row.symbolName ?? "portfolio",
          });
        }
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
    (refreshed?.status === "SUBMITTED" &&
      (!TERMINAL.has(sodexStatus ?? "") || !evidence.fillProven));

  return {
    signedOrderId: row.id,
    clOrdId: row.clOrdId,
    sodexOrderId: refreshed?.sodexOrderId ?? row.sodexOrderId,
    hatchStatus: refreshed?.status ?? row.status,
    sodexStatus,
    executionStatus:
      evidence.fillProven && sodexStatus === "FILLED"
        ? "FILLED"
        : sodexStatus ?? (waitingForMatch ? "WAITING_FOR_MATCH" : "UNKNOWN"),
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
    fillEvidence: {
      executedQty: Number(filledQty ?? 0),
      tradeCount: tradeIds.length,
      balanceChanged: evidence.balanceChanged,
      fillProven: evidence.fillProven,
    },
    protocolNote:
      "Path A buys SoDEX vault tokens on ValueChain. FILLED requires executedQty > 0, a SoDEX trade, and (when snapshotted) a base-balance increase. Relay HTTP alone never proves a fill.",
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
