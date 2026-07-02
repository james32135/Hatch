/**
 * Spot batch order param builders — field order from official sodex-go-sdk-public.
 * Source: spot/types/batch_new_order_request.go, batch_cancel_order_request.go
 * Action names: batchNewOrder, batchCancelOrder
 */
export type SpotOrderSide = 1 | 2; // BUY | SELL
export type SpotOrderType = 1 | 2; // LIMIT | MARKET
export type SpotTimeInForce = 1 | 2 | 3 | 4; // GTC | FOK | IOC | GTX

export const SPOT_TRADE_BATCH_PATH = "/trade/orders/batch" as const;
export const SPOT_ACTION_BATCH_NEW = "batchNewOrder" as const;
export const SPOT_ACTION_BATCH_CANCEL = "batchCancelOrder" as const;

export type SpotOrderRow = {
  symbolID: number;
  clOrdID: string;
  side: SpotOrderSide;
  type: SpotOrderType;
  timeInForce: SpotTimeInForce;
  price: string;
  quantity: string;
};

export function buildBatchNewOrdersParams(input: {
  accountID: number;
  orders: SpotOrderRow[];
}): { accountID: number; orders: SpotOrderRow[] } {
  return {
    accountID: input.accountID,
    orders: input.orders.map((o) => ({
      symbolID: o.symbolID,
      clOrdID: o.clOrdID,
      side: o.side,
      type: o.type,
      timeInForce: o.timeInForce,
      price: o.price,
      quantity: o.quantity,
    })),
  };
}

export function buildBatchNewOrderParams(input: {
  accountID: number;
  symbolID: number;
  clOrdID: string;
  side: SpotOrderSide;
  type: SpotOrderType;
  timeInForce: SpotTimeInForce;
  price: string;
  quantity: string;
}): { accountID: number; orders: SpotOrderRow[] } {
  return buildBatchNewOrdersParams({
    accountID: input.accountID,
    orders: [
      {
        symbolID: input.symbolID,
        clOrdID: input.clOrdID,
        side: input.side,
        type: input.type,
        timeInForce: input.timeInForce,
        price: input.price,
        quantity: input.quantity,
      },
    ],
  });
}

export function buildBatchCancelParams(input: {
  accountID: number;
  symbolID: number;
  clOrdID: string;
  orderID?: number;
}): {
  accountID: number;
  cancels: Array<{
    symbolID: number;
    clOrdID: string;
    orderID?: number;
  }>;
} {
  const item: {
    symbolID: number;
    clOrdID: string;
    orderID?: number;
  } = {
    symbolID: input.symbolID,
    clOrdID: input.clOrdID,
  };
  if (input.orderID !== undefined) item.orderID = input.orderID;
  return {
    accountID: input.accountID,
    cancels: [item],
  };
}

export function estimateLimitNotionalUsd(price: string, quantity: string): number {
  return Number(price) * Number(quantity);
}
