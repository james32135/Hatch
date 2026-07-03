import { describe, expect, it } from "vitest";
import {
  buildBatchCancelParams,
  buildBatchNewOrderParams,
  estimateLimitNotionalUsd,
  SPOT_ACTION_BATCH_NEW,
} from "../src/services/spotOrders.js";

describe("spotOrders helpers", () => {
  it("preserves Go struct field order for batch new", () => {
    const params = buildBatchNewOrderParams({
      accountID: 1,
      symbolID: 3,
      clOrdID: "abc",
      side: 1,
      type: 1,
      timeInForce: 3,
      price: "1.5",
      quantity: "2",
    });
    expect(Object.keys(params)).toEqual(["accountID", "orders"]);
    expect(Object.keys(params.orders[0]!)).toEqual([
      "symbolID",
      "clOrdID",
      "side",
      "type",
      "timeInForce",
      "price",
      "quantity",
    ]);
    expect(SPOT_ACTION_BATCH_NEW).toBe("batchNewOrder");
    expect(estimateLimitNotionalUsd("1.5", "2")).toBe(3);
  });

  it("omits orderID when unset on cancel", () => {
    const a = buildBatchCancelParams({
      accountID: 1,
      symbolID: 1,
      clOrdID: "x",
    });
    expect(a.cancels[0]).not.toHaveProperty("orderID");
    const b = buildBatchCancelParams({
      accountID: 1,
      symbolID: 1,
      clOrdID: "x",
      orderID: 99,
    });
    expect(b.cancels[0]?.orderID).toBe(99);
  });
});
