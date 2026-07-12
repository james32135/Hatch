/**
 * Verified on-chain / gateway addresses for HATCH.
 * SSI protocol + index tokens: SoSoValue Whitepaper §5.3 Solution Design
 * (https://sosovalue-white-paper.gitbook.io/.../5.3-solution-design).
 * Blank / optional env overrides must stay blank until verified — never invent.
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

/** Live mainnet defaults — always resolve via markets/symbols at draft time for the active network.
 * Testnet vUSSI id is 24 (not 26). minNotional MAG7/USSI = 5 on both nets (verified 2026-07-12). */
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

/**
 * Base SSI / SOSO tokens — Whitepaper §5.3 + BaseScan verified.
 * Env overrides optional; never invent missing addresses.
 */
export const TOKENS = {
  mag7Ssi:
    (process.env.MAG7_SSI_TOKEN_ADDRESS as `0x${string}` | undefined) ??
    ("0x9E6A46f294bB67c20F1D1E7AfB0bBEf614403B55" as const),
  defiSsi:
    (process.env.DEFI_SSI_TOKEN_ADDRESS as `0x${string}` | undefined) ??
    ("0x164ffdaE2fe3891714bc2968f1875ca4fA1079D0" as const),
  memeSsi:
    (process.env.MEME_SSI_TOKEN_ADDRESS as `0x${string}` | undefined) ??
    ("0xdd3acDBDc7b358Df453a6CB6bCA56C92aA5743aA" as const),
  ussi:
    (process.env.USSI_TOKEN_ADDRESS as `0x${string}` | undefined) ??
    ("0x3a46ed8FCeb6eF1ADA2E4600A522AE7e24D2Ed18" as const),
  sMag7Ssi:
    (process.env.SMAG7_SSI_TOKEN_ADDRESS as `0x${string}` | undefined) ??
    ("0x3d8f0ddb4bb9332Cb89dEC22d273d9be1a91530b" as const),
  sosoBase: "0x624e2e7fdc8903165f64891672267ab0fcb98831" as const,
  sosoEthereum: "0x76a0e27618462bdac7a29104bdcfff4e6bfcea2d" as const,
} as const;

/**
 * Official SSI Protocol contracts on Base — Whitepaper §5.3 Key Addresses.
 * On-chain mint/burn is WLP (KYB) only. HATCH parents use Path A (SoDEX vault).
 * No invented "router" address — whitepaper lists swap/issuer/factory instead.
 */
export const SSI_PROTOCOL = {
  chainId: 8453,
  source:
    "https://sosovalue-white-paper.gitbook.io/sosovalue-whitepaper/5.-sosovalue-indexes-new-approach-to-passive-crypto-investment-for-the-masses/5.3-solution-design",
  swap: "0xF909bfa750721501B4F8433588FaE5cE303Db08B" as const,
  factory: "0xb04eB6b64137d1673D46731C8f84718092c50B0D" as const,
  issuer: "0x0306acEb4c20FF33480d90038F8b375cC6A6b66e" as const,
  rebalancer: "0x84663e30973D552ac357FD04F3Ac6ebbD495Ab15" as const,
  feeManager: "0x2E469365030F068eCB1176a0D5600bA470Cf07A9" as const,
  stakeFactory: "0x585834242BB31427B1dC7486DD4BDe7c724e35c1" as const,
  assetLocking: "0x935A4B1F6F3E891a226b2522ac22d45Ce5839383" as const,
  protocolOwner: "0xd463D3d8333b7AD6a14d00e1700C80AF5A37F751" as const,
  earnUrl: "https://ssi.sosovalue.com/earn",
  siteUrl: "https://ssi.sosovalue.com",
} as const;

/**
 * HATCH-deployed ValueChain contracts + optional SSI env overrides.
 * Path B retail mint stays blocked (WLP-only per whitepaper).
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
  /** @deprecated Prefer SSI_PROTOCOL.swap / issuer — kept for env compatibility */
  ssiRouter: process.env.SSI_ROUTER_ADDRESS ?? "",
  /** Optional override; official stakeFactory is SSI_PROTOCOL.stakeFactory */
  ssiStaking: process.env.SSI_STAKING_ADDRESS ?? SSI_PROTOCOL.stakeFactory,
} as const;
