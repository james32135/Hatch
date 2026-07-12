/**
 * SoDEX HTTP client — READ + RELAY only.
 * Never signs with a global custody key. Parent provides X-API-Sign.
 * See SODEX_ACCOUNT_ARCHITECTURE.md.
 */
import { SODEX, SODEX_SYMBOLS } from "../config/addresses.js";
import type { HatchProfile } from "../config/environment.js";
import { HatchError } from "../lib/errors.js";
import { redisGet, redisSet } from "../lib/redis.js";

export interface SodexRelayHeaders {
  /** Omit for master-wallet default key path */
  apiKeyName?: string;
  apiSign: string;
  apiNonce: string;
}

export class SodexClient {
  constructor(private readonly profile: HatchProfile) {}

  get spotRest(): string {
    return this.profile.sodexSpotRest.replace(/\/$/, "");
  }

  get appUrl(): string {
    return this.profile.sodexAppUrl;
  }

  get symbols() {
    return SODEX_SYMBOLS;
  }

  async getPublic<T = unknown>(path: string, cacheTtl = 15): Promise<T> {
    const key = `sodex:${this.profile.id}:${path}`;
    if (cacheTtl > 0) {
      const hit = await redisGet(key);
      if (hit) return JSON.parse(hit) as T;
    }
    const url = `${this.spotRest}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const text = await res.text();
      throw new HatchError(
        "unavailable",
        `SoDEX ${res.status}: ${text.slice(0, 200)}`,
        502,
      );
    }
    const data = (await res.json()) as T;
    if (cacheTtl > 0) await redisSet(key, JSON.stringify(data), cacheTtl);
    return data;
  }

  /** Official: GET /accounts/{userAddress}/state */
  async accountState(userAddress: string): Promise<unknown> {
    const addr = userAddress.toLowerCase();
    return this.getPublic(`/accounts/${addr}/state`, 10);
  }

  /** Official: GET /accounts/{userAddress}/balances — primary portfolio source */
  async accountBalances(userAddress: string): Promise<unknown> {
    const addr = userAddress.toLowerCase();
    return this.getPublic(`/accounts/${addr}/balances`, 10);
  }

  /** Official: GET /accounts/{userAddress}/orders — open orders */
  async openOrders(userAddress: string, opts?: { symbol?: string }): Promise<unknown> {
    const addr = userAddress.toLowerCase();
    const q = opts?.symbol ? `?symbol=${encodeURIComponent(opts.symbol)}` : "";
    return this.getPublic(`/accounts/${addr}/orders${q}`, 5);
  }

  /** Official: GET /accounts/{userAddress}/orders/history */
  async orderHistory(
    userAddress: string,
    opts?: { symbol?: string; limit?: number; startTime?: number; endTime?: number },
  ): Promise<unknown> {
    const addr = userAddress.toLowerCase();
    const params = new URLSearchParams();
    if (opts?.symbol) params.set("symbol", opts.symbol);
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.startTime) params.set("startTime", String(opts.startTime));
    if (opts?.endTime) params.set("endTime", String(opts.endTime));
    const q = params.toString() ? `?${params}` : "";
    return this.getPublic(`/accounts/${addr}/orders/history${q}`, 0);
  }

  /** Official: GET /accounts/{userAddress}/trades */
  async userTrades(
    userAddress: string,
    opts?: {
      symbol?: string;
      orderID?: number;
      limit?: number;
      startTime?: number;
      endTime?: number;
    },
  ): Promise<unknown> {
    const addr = userAddress.toLowerCase();
    const params = new URLSearchParams();
    if (opts?.symbol) params.set("symbol", opts.symbol);
    if (opts?.orderID != null) params.set("orderID", String(opts.orderID));
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.startTime) params.set("startTime", String(opts.startTime));
    if (opts?.endTime) params.set("endTime", String(opts.endTime));
    const q = params.toString() ? `?${params}` : "";
    return this.getPublic(`/accounts/${addr}/trades${q}`, 0);
  }

  /** Official: GET /markets/tickers — spot mark prices */
  async marketsTickers(): Promise<unknown> {
    return this.getPublic("/markets/tickers", 5);
  }

  async marketsSymbols(): Promise<unknown> {
    return this.getPublic("/markets/symbols", 60);
  }

  async ticker(symbolId: number): Promise<unknown> {
    return this.getPublic(`/markets/ticker?symbolId=${symbolId}`, 5);
  }

  /**
   * Forward a pre-signed trading request. Backend does not create the signature.
   */
  async relay(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body: unknown | undefined,
    headers: SodexRelayHeaders,
  ): Promise<{ status: number; data: unknown }> {
    if (!this.profile.writesAllowed) {
      throw new HatchError("wrong_environment", "Writes disabled for this profile", 403);
    }
    const url = `${this.spotRest}${path.startsWith("/") ? path : `/${path}`}`;
    const h: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      "X-API-Sign": headers.apiSign,
      "X-API-Nonce": headers.apiNonce,
    };
    if (headers.apiKeyName) {
      h["X-API-Key"] = headers.apiKeyName;
    }
    const res = await fetch(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { status: res.status, data };
  }
}

export function createSodexClient(profile: HatchProfile): SodexClient {
  return new SodexClient(profile);
}

export function sodexGatewayMeta(profile: HatchProfile) {
  const net = profile.id === "testnet" ? SODEX.testnet : SODEX.mainnet;
  return {
    chainId: net.chainId,
    spotRest: net.spotRest,
    spotWs: net.spotWs,
    appUrl: net.appUrl,
    symbols: SODEX_SYMBOLS,
  };
}
