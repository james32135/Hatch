/**
 * INTERNAL ENGINEERING ONLY — testnet SoDEX batch place/cancel e2e.
 * Uses SODEX_* eng credentials. Never for production parent funds.
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache, getEnv } from "../src/config/env.js";
import { SODEX } from "../src/config/addresses.js";
import {
  engSignExchangeAction,
  engSodexAddress,
  engSodexAccountId,
} from "../src/services/engSodexSigner.js";
import {
  assertMainnetTestGuard,
  MAINNET_TEST_MAX_USDC,
} from "../src/services/mainnetTestGuard.js";
import { createSodexClient } from "../src/clients/sodex.js";
import { resolveProfile } from "../src/config/environment.js";
import {
  buildBatchCancelParams,
  buildBatchNewOrderParams,
  estimateLimitNotionalUsd,
  SPOT_ACTION_BATCH_CANCEL,
  SPOT_ACTION_BATCH_NEW,
  SPOT_TRADE_BATCH_PATH,
} from "../src/services/spotOrders.js";

function loadRootEnv(): void {
  for (const p of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ]) {
    if (existsSync(p)) loadDotenv({ path: p, override: false });
  }
  if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
    process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
  }
}

describe("eng SoDEX testnet signed order e2e", () => {
  beforeAll(() => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
  });

  it("aborts mainnet eng place when notional > MAINNET_TEST_MAX (minNotional 5)", () => {
    const minNotional = 5;
    expect(minNotional).toBeGreaterThan(MAINNET_TEST_MAX_USDC);
    expect(() => assertMainnetTestGuard("mainnet", minNotional)).toThrow(
      /mainnet_test_guard|1 USDC/i,
    );
  });

  it("places far LIMIT then cancels on testnet (eng master wallet, no X-API-Key)", async () => {
    const network = "testnet" as const;
    const chainId = SODEX.testnet.chainId;
    const address = engSodexAddress();
    const accountID = engSodexAccountId();
    const client = createSodexClient(resolveProfile("testnet"));

    const symbolID = 1;
    const price = "1000";
    const quantity = "0.005";
    const notional = estimateLimitNotionalUsd(price, quantity);
    assertMainnetTestGuard(network, notional);
    expect(notional).toBeGreaterThanOrEqual(5);

    const clOrdID = `hatch${Date.now().toString(36)}`.slice(0, 36);
    const placeParams = buildBatchNewOrderParams({
      accountID,
      symbolID,
      clOrdID,
      side: 1,
      type: 1,
      timeInForce: 1,
      price,
      quantity,
    });

    const placeNonce = BigInt(Date.now());
    const placed = await engSignExchangeAction({
      scope: "spot",
      chainId,
      actionType: SPOT_ACTION_BATCH_NEW,
      params: placeParams,
      nonce: placeNonce,
      network,
      tradeAmountUsd: notional,
    });

    const placeRes = await client.relay("POST", SPOT_TRADE_BATCH_PATH, placeParams, {
      apiSign: placed.apiSign,
      apiNonce: placed.nonce,
    });

    const placeBody = placeRes.data as {
      code?: number;
      data?: Array<{ code: number; clOrdID: string; orderID?: number }>;
    };

    expect(placeRes.status).toBeLessThan(300);
    expect(placeBody.code).toBe(0);
    const placedRow = placeBody.data?.[0];
    expect(placedRow?.code === 0 || placedRow?.orderID).toBeTruthy();

    const cancelParams = buildBatchCancelParams({
      accountID,
      symbolID,
      clOrdID,
      orderID: placedRow?.orderID,
    });

    const cancelNonce = BigInt(Date.now() + 1);
    const canceled = await engSignExchangeAction({
      scope: "spot",
      chainId,
      actionType: SPOT_ACTION_BATCH_CANCEL,
      params: cancelParams,
      nonce: cancelNonce,
      network,
      tradeAmountUsd: 0,
    });

    const cancelRes = await client.relay(
      "DELETE",
      SPOT_TRADE_BATCH_PATH,
      cancelParams,
      {
        apiSign: canceled.apiSign,
        apiNonce: canceled.nonce,
      },
    );

    expect(cancelRes.status).toBeLessThan(300);
    const cancelBody = cancelRes.data as { code?: number };
    if (cancelBody.code !== 0) {
      console.warn("cancel soft-fail", cancelRes.data);
    }

    const state = await client.accountState(address);
    expect(state).toBeTruthy();
  }, 60_000);
});
