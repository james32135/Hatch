/**
 * MAINNET_TEST_GUARD — hard safety for internal engineering SoDEX testing only.
 * Production parent relays are unaffected unless the eng test wallet is used.
 *
 * Absolute max on mainnet eng tests: 1.00 USDC
 * Preferred: 0.20 USDC
 */
import { HatchError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

/** Hard-coded — do not raise without explicit product/security review */
export const MAINNET_TEST_MAX_USDC = 1.0;
export const MAINNET_TEST_PREFERRED_USDC = 0.2;

export type NetworkKind = "mainnet" | "testnet" | "mainnet-readonly";

export function isMainnetNetwork(network: string): boolean {
  const n = network.toLowerCase();
  return n === "mainnet" || n === "mainnet-readonly" || n === "MAINNET";
}

/**
 * Reject mainnet eng/test trades above 1 USDC.
 * Always log on reject.
 */
export function assertMainnetTestGuard(
  network: string,
  tradeAmountUsd: number,
  context = "mainnet_test_guard",
): void {
  if (!isMainnetNetwork(network)) return;
  if (!Number.isFinite(tradeAmountUsd) || tradeAmountUsd < 0) {
    logger.error({ network, tradeAmountUsd, context }, "MAINNET_TEST_GUARD invalid amount");
    throw new HatchError(
      "mainnet_test_guard",
      "Invalid trade amount for mainnet test guard",
      400,
      { tradeAmountUsd, max: MAINNET_TEST_MAX_USDC },
    );
  }
  if (tradeAmountUsd > MAINNET_TEST_MAX_USDC) {
    logger.error(
      {
        network,
        tradeAmountUsd,
        max: MAINNET_TEST_MAX_USDC,
        context,
      },
      "MAINNET_TEST_GUARD rejected — exceeds 1 USDC mainnet eng test cap",
    );
    throw new HatchError(
      "mainnet_test_guard",
      `Mainnet engineering test trade ${tradeAmountUsd} USDC exceeds hard cap ${MAINNET_TEST_MAX_USDC} USDC`,
      400,
      {
        tradeAmountUsd,
        max: MAINNET_TEST_MAX_USDC,
        preferred: MAINNET_TEST_PREFERRED_USDC,
      },
    );
  }
}

/** True when wallet is the internal eng SoDEX test address from env */
export function isEngSodexTestWallet(wallet: string | undefined | null): boolean {
  const eng = process.env.SODEX_ADDRESS?.replace(/^"|"$/g, "").toLowerCase();
  if (!eng || !wallet) return false;
  return wallet.toLowerCase() === eng;
}
