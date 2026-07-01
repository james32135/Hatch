import { HatchError } from "../lib/errors.js";
import { getEnv } from "../config/env.js";

/**
 * Best-effort notional estimate from a SoDEX order / batch body.
 * Sums price*quantity across batch orders; MARKET (price 0) uses quantity as USD proxy.
 */
export function estimateNotionalUsd(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const params = (root.params ?? root) as Record<string, unknown>;

  const orders = params.orders;
  if (Array.isArray(orders) && orders.length) {
    let sum = 0;
    let any = false;
    for (const row of orders) {
      const n = estimateSingleOrderNotional(row);
      if (n !== null) {
        sum += n;
        any = true;
      }
    }
    return any ? sum : null;
  }

  return estimateSingleOrderNotional(params);
}

function estimateSingleOrderNotional(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const funds = parseDecimal(o.funds);
  if (funds !== null) return funds;
  const price = parseDecimal(o.price);
  const quantity = parseDecimal(o.quantity);
  if (quantity === null) return null;
  // MARKET / price 0: treat quantity as USDC notional proxy for vault ~$1
  if (price === null || price === 0) return quantity;
  return price * quantity;
}

function parseDecimal(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

export function assertNotionalCap(body: unknown): number | null {
  const notional = estimateNotionalUsd(body);
  if (notional === null) return null;
  const cap = getEnv().TRADING_MAX_NOTIONAL_USD;
  if (notional > cap) {
    throw new HatchError(
      "notional_cap",
      `Order notional ${notional} exceeds cap ${cap} USD`,
      400,
      { notional, cap },
    );
  }
  return notional;
}
