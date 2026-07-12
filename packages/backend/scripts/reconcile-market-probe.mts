/**
 * Reconcile delayed SoDEX order/trade indexing into MARKET_PROBE_TESTNET.json.
 * Read-only: no orders or cancels are submitted.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function unwrapData(value: unknown): unknown {
  const root = asObject(value);
  return root.data ?? value;
}

function asArray(value: unknown, keys: string[]): Json[] {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data.filter((v): v is Json => Boolean(v && typeof v === "object"));
  const object = asObject(data);
  for (const key of keys) {
    if (Array.isArray(object[key])) {
      return (object[key] as unknown[]).filter(
        (v): v is Json => Boolean(v && typeof v === "object"),
      );
    }
  }
  return [];
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} -> ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as unknown;
}

function idOf(row: Json): number | null {
  const raw = row.orderID ?? row.orderId ?? row.i;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function clOrdOf(row: Json): string {
  return String(row.clOrdID ?? row.c ?? "");
}

async function main() {
  const root = resolve(process.cwd(), "../..");
  const source = resolve(root, "MARKET_PROBE_TESTNET.json");
  const probe = JSON.parse(readFileSync(source, "utf8")) as Json;
  const identity = asObject(probe.identity);
  const address = String(identity.protocolAddress);
  const base = "https://testnet-gw.sodex.dev/api/v1/spot";
  const markets = Array.isArray(probe.markets) ? (probe.markets as Json[]) : [];

  for (const market of markets) {
    const symbol = String(market.symbol);
    const encoded = encodeURIComponent(symbol);
    const [openResponse, historyResponse, tradeResponse] = await Promise.all([
      getJson(`${base}/accounts/${address}/orders?symbol=${encoded}`),
      getJson(`${base}/accounts/${address}/orders/history?symbol=${encoded}&limit=500`),
      getJson(`${base}/accounts/${address}/trades?symbol=${encoded}&limit=1000`),
    ]);
    const orders = [
      ...asArray(openResponse, ["orders", "O"]),
      ...asArray(historyResponse, ["orders", "O"]),
    ];
    const trades = asArray(tradeResponse, ["trades"]);
    const outcomes = Array.isArray(market.outcomes) ? (market.outcomes as Json[]) : [];

    for (const outcome of outcomes) {
      const orderID = Number(outcome.orderID);
      const hasOrderID = Number.isFinite(orderID) && orderID > 0;
      const clOrdID = String(outcome.clOrdID ?? "");
      const order = orders.find(
        (row) =>
          (clOrdID && clOrdOf(row) === clOrdID) ||
          (hasOrderID && idOf(row) === orderID),
      );
      const matchedTrades = trades.filter(
        (row) =>
          (clOrdID && clOrdOf(row) === clOrdID) ||
          (hasOrderID && idOf(row) === orderID),
      );

      if (order) {
        outcome.matcherAccepted = true;
        outcome.terminalStatus = String(order.status ?? order.X ?? "");
        outcome.executedQty = String(order.executedQty ?? order.z ?? "0");
      }
      if (matchedTrades.length > 0) {
        outcome.tradeIDs = matchedTrades
          .map((row) => Number(row.tradeID ?? row.t))
          .filter(Number.isFinite);
      }

      if (outcome.gatewayAccepted === true) {
        if (!order) {
          outcome.reason = "gateway returned orderID but order was not found after delayed reconciliation";
        } else if (
          Array.isArray(outcome.tradeIDs) &&
          outcome.tradeIDs.length === 0 &&
          asObject(outcome.case).kind !== "LIMIT_GTC"
        ) {
          outcome.reason = `terminal ${String(outcome.terminalStatus || "UNKNOWN")} with no fill`;
        } else {
          outcome.reason = null;
        }
      }
    }
  }

  probe.reconciledAt = new Date().toISOString();
  writeFileSync(source, `${JSON.stringify(probe, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
