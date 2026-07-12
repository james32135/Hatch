/**
 * SSI flow orchestration — Path A (SoDEX-native) preferred for parents.
 * Path B (Base mint via issuer/swap) is WLP/KYB-only per Whitepaper §5.3 —
 * blocked for HATCH retail parents. Never invents mint calldata.
 */
import {
  HATCH_CONTRACTS,
  SODEX_SYMBOLS,
  SSI_PROTOCOL,
  TOKENS,
} from "../config/addresses.js";

export type SsiPath = "A_SODEX_VAULT" | "B_BASE_MINT" | "SSI_EARN_REDIRECT";

export interface SsiFlowPlan {
  path: SsiPath;
  available: boolean;
  reason?: string;
  steps: string[];
  symbols?: unknown;
  tokens?: unknown;
  protocol?: unknown;
  earnUrl?: string;
  sodexAppUrl?: string;
}

export function planMint(input: {
  index: "MAG7" | "USSI";
  amountUsd?: number;
}): SsiFlowPlan {
  const symbol =
    input.index === "MAG7"
      ? SODEX_SYMBOLS.vMAG7ssi_vUSDC
      : SODEX_SYMBOLS.vUSSI_vUSDC;
  return {
    path: "A_SODEX_VAULT",
    available: true,
    steps: [
      "Parent Enable Trading on SoDEX (own account)",
      "Fund Spot with vUSDC",
      `POST /api/allowances/sign-draft (or manual) for ${symbol.name}`,
      "Parent EIP-712 signs → POST /api/sodex/relay batchNewOrder BUY",
      "Portfolio snapshot refreshes from SoDEX balances + account state",
    ],
    symbols: symbol,
    sodexAppUrl: "https://sodex.com",
  };
}

export function planRedeem(input: { index: "MAG7" | "USSI" }): SsiFlowPlan {
  const symbol =
    input.index === "MAG7"
      ? SODEX_SYMBOLS.vMAG7ssi_vUSDC
      : SODEX_SYMBOLS.vUSSI_vUSDC;
  return {
    path: "A_SODEX_VAULT",
    available: true,
    steps: [
      `Parent signs SELL on ${symbol.name} via cancel/new order drafts`,
      "POST /api/sodex/relay with parent signature",
      "Balances refresh via SoDEX balances + /api/portfolio/:childId",
    ],
    symbols: symbol,
  };
}

export function planStake(): SsiFlowPlan {
  return {
    path: "SSI_EARN_REDIRECT",
    available: true,
    reason:
      "Official stakeFactory/assetLocking are documented (Whitepaper §5.3). Parent-facing stake ABI not audited into HATCH — use SSI Earn UI.",
    steps: [
      "Hold MAG7.ssi on Base (see TOKENS.mag7Ssi)",
      "Deposit via official SSI Earn UI — auto-stakes per docs",
      "Receive sMAG7.ssi receipt token",
      "HATCH reads balances via GET /api/ssi/balances/:address",
      `Known contracts: stakeFactory=${SSI_PROTOCOL.stakeFactory}, assetLocking=${SSI_PROTOCOL.assetLocking}`,
    ],
    tokens: {
      mag7Ssi: TOKENS.mag7Ssi,
      sMag7Ssi: TOKENS.sMag7Ssi,
    },
    protocol: {
      stakeFactory: SSI_PROTOCOL.stakeFactory,
      assetLocking: SSI_PROTOCOL.assetLocking,
    },
    earnUrl: SSI_PROTOCOL.earnUrl,
  };
}

export function planPathBMint(): SsiFlowPlan {
  return {
    path: "B_BASE_MINT",
    available: false,
    reason:
      "On-chain mint/burn is WLP (KYB) only per Whitepaper §5.3. HATCH parents buy SSI exposure via Path A (SoDEX vault). No retail mint calldata.",
    steps: [
      "WLP mints via issuer/swap after Protocol Server quote (not a HATCH parent flow)",
      `Official contracts: swap=${SSI_PROTOCOL.swap}, issuer=${SSI_PROTOCOL.issuer}, factory=${SSI_PROTOCOL.factory}`,
      "Parents: use Path A — EIP-712 SoDEX BUY on vMAG7ssi_vUSDC / vUSSI_vUSDC",
    ],
    tokens: TOKENS,
    protocol: SSI_PROTOCOL,
  };
}

export function ssiCapabilityMatrix() {
  return {
    pathA_sodexVault: {
      mint: true,
      redeem: true,
      note: "Parent-signed SoDEX vault orders (retail Path A)",
    },
    pathB_baseMint: {
      available: false,
      blockedReason:
        "Whitepaper §5.3: on-chain mint/burn is WLP (KYB) only — not for HATCH parents",
      protocol: SSI_PROTOCOL,
    },
    stake: {
      mode: "ssi_earn_redirect",
      sMag7: TOKENS.sMag7Ssi,
      stakeFactory: SSI_PROTOCOL.stakeFactory,
      assetLocking: SSI_PROTOCOL.assetLocking,
      earnUrl: SSI_PROTOCOL.earnUrl,
    },
    tokens: TOKENS,
    protocol: SSI_PROTOCOL,
    balanceRefresh: [
      "GET /api/ssi/balances/:address",
      "GET /api/portfolio/:childId",
    ],
    custody: false,
    hatchContractsNote: {
      ssiRouterEnv: HATCH_CONTRACTS.ssiRouter || null,
      ssiStakingEnv: HATCH_CONTRACTS.ssiStaking || null,
    },
  };
}
