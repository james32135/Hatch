/**
 * Verified on-chain / gateway addresses for HATCH.
 * Sources cited in IMPLEMENTATION.md §5 and §10.
 * Blank fields must stay blank until verified — never invent.
 */

export const SOSO_API_BASE_URL = "https://openapi.sosovalue.com/openapi/v1" as const;

export const SODEX = {
  mainnet: {
    baseUrl: "https://mainnet-gw.sodex.dev",
    spotRest: "https://mainnet-gw.sodex.dev/api/v1/spot",
    perpsRest: "https://mainnet-gw.sodex.dev/api/v1/perps",
    spotWs: "wss://mainnet-gw.sodex.dev/ws/spot",
    perpsWs: "wss://mainnet-gw.sodex.dev/ws/perps",
    appUrl: "https://sodex.com",
    chainId: 286623,
  },
  testnet: {
    baseUrl: "https://testnet-gw.sodex.dev",
    spotRest: "https://testnet-gw.sodex.dev/api/v1/spot",
    perpsRest: "https://testnet-gw.sodex.dev/api/v1/perps",
    spotWs: "wss://testnet-gw.sodex.dev/ws/spot",
    perpsWs: "wss://testnet-gw.sodex.dev/ws/perps",
    appUrl: "https://testnet.sodex.com",
    chainId: 138565,
  },
} as const;

/** Live mainnet symbol IDs from GET /spot/markets/symbols (2026-07-11) */
export const SODEX_SYMBOLS = {
  vMAG7ssi_vUSDC: { id: 3, name: "vMAG7ssi_vUSDC", baseCoin: "vMAG7.ssi" },
  vUSSI_vUSDC: { id: 26, name: "vUSSI_vUSDC", baseCoin: "vUSSI" },
  vsMAG7CoinId: 13,
} as const;

export const VALUECHAIN = {
  mainnet: {
    chainId: 286623,
    rpcUrl: "https://mainnet.valuechain.xyz",
    wsUrl: "wss://mainnet-ws.valuechain.xyz",
    explorerUrl: "https://main-scan.valuechain.xyz",
    currency: "SOSO",
  },
  testnet: {
    chainId: 138565,
    rpcUrl: "https://testnet-v2.valuechain.xyz",
    wsUrl: "wss://testnet-v2-ws.valuechain.xyz",
    explorerUrl: "https://test-scan.valuechain.xyz",
    currency: "SOSO",
  },
  wsoso: "0x5050505050505050505050505050505050505050" as const,
} as const;

export const BASE = {
  chainId: 8453,
  rpcUrl: "https://mainnet.base.org",
  explorerUrl: "https://basescan.org",
} as const;

/** Base SSI / SOSO tokens — verified via BaseScan / official listings */
export const TOKENS = {
  mag7Ssi: "0x9E6A46f294bB67c20F1D1E7AfB0bBEf614403B55" as const,
  ussi: "0x3a46ed8FCeb6eF1ADA2E4600A522AE7e24D2Ed18" as const,
  sMag7Ssi: "0x3d8f0ddb4bb9332Cb89dEC22d273d9be1a91530b" as const,
  sosoBase: "0x624e2e7fdc8903165f64891672267ab0fcb98831" as const,
  sosoEthereum: "0x76a0e27618462bdac7a29104bdcfff4e6bfcea2d" as const,
} as const;

/**
 * Fill after Foundry deploy (Phase 3).
 * SSI Router / Staking: discover via ssi.sosovalue.com txs — do not invent.
 */
export const HATCH_CONTRACTS = {
  mainnet: {
    log: process.env.HATCH_LOG_ADDRESS_MAINNET ?? "0x06a8ADeB3d1d1a4160606967308C275a627E4fCB",
    schedule:
      process.env.HATCH_SCHEDULE_ADDRESS_MAINNET ??
      "0xfdC9A9F19441f10729769393CBBD6d870802Ace9",
  },
  testnet: {
    log:
      process.env.HATCH_LOG_ADDRESS_TESTNET ??
      "0xB4483128Bf95aa63621cB9EcA7f5d22a0d546b6C",
    schedule:
      process.env.HATCH_SCHEDULE_ADDRESS_TESTNET ??
      "0x3db8750EE3a397b5A8A4e1842Bfb69f511342C6b",
  },
  ssiRouter: process.env.SSI_ROUTER_ADDRESS ?? "",
  ssiStaking: process.env.SSI_STAKING_ADDRESS ?? "",
} as const;
