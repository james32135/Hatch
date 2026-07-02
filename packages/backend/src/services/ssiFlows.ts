/**
 * SSI flow orchestration — Path A (SoDEX-native) preferred.
 * Path B (Base mint via Router) blocked until SSI_ROUTER_ADDRESS verified.
 * Never invents router/staking addresses. Stake/redeem follow official SSI docs.
 */
import { HATCH_CONTRACTS, SODEX_SYMBOLS, TOKENS } from "../config/addresses.js";

export type SsiPath = "A_SODEX_VAULT" | "B_BASE_MINT" | "SSI_EARN_REDIRECT";

export interface SsiFlowPlan {
  path: SsiPath;
  available: boolean;
  reason?: string;
  steps: string[];
  symbols?: unknown;
  tokens?: unknown;
  earnUrl?: string;
  sodexAppUrl?: string;
}

export function planMint(input: {
  index: "MAG7" | "USSI";
  amountUsd?: number;
}): SsiFlowPlan {
  // Path A always available — parent buys vault token on SoDEX
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
      "Portfolio snapshot refreshes from SoDEX account state",
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
      "Balances refresh via SoDEX account state + /api/portfolio/:childId",
    ],
    symbols: symbol,
  };
}

export function planStake(): SsiFlowPlan {
  // Official: deposit MAG7.ssi auto-stakes; sMAG7.ssi is receipt (Base)
  if (!HATCH_CONTRACTS.ssiStaking && !HATCH_CONTRACTS.ssiRouter) {
    return {
      path: "SSI_EARN_REDIRECT",
      available: true,
      reason:
        "SSI staking contract address not verified in HATCH env — use official SSI Earn / Base token flows",
      steps: [
        "Hold MAG7.ssi on Base (see TOKENS.mag7Ssi)",
        "Deposit via official SSI Earn UI (ssi.sosovalue.com) — auto-stakes per docs",
        "Receive sMAG7.ssi receipt token",
        "HATCH reads balances via GET /api/ssi/balances/:address",
        "Do not invent staking contract calls until SSI_STAKING_ADDRESS verified",
      ],
      tokens: {
        mag7Ssi: TOKENS.mag7Ssi,
        sMag7Ssi: TOKENS.sMag7Ssi,
      },
      earnUrl: "https://ssi.sosovalue.com",
    };
  }
  return {
    path: "B_BASE_MINT",
    available: false,
    reason: "Staking ABI wiring pending verified address audit",
    steps: ["Set SSI_STAKING_ADDRESS after forge/BaseScan verification"],
  };
}

export function planPathBMint(): SsiFlowPlan {
  if (!HATCH_CONTRACTS.ssiRouter) {
    return {
      path: "B_BASE_MINT",
      available: false,
      reason:
        "SSI_ROUTER_ADDRESS blank — Path B blocked until router verified (architecture lock)",
      steps: [
        "Discover router via ssi.sosovalue.com txs / SoSoValueLabs/ssi-protocol",
        "Set SSI_ROUTER_ADDRESS in env",
        "Then implement mint calldata — never invent",
      ],
      tokens: TOKENS,
    };
  }
  return {
    path: "B_BASE_MINT",
    available: false,
    reason: "Router set but mint ABI not yet audited into HATCH",
    steps: ["Audit router ABI against official SSI protocol before enabling"],
  };
}

export function ssiCapabilityMatrix() {
  return {
    pathA_sodexVault: { mint: true, redeem: true, note: "Parent-signed SoDEX orders" },
    pathB_baseMint: {
      available: !!HATCH_CONTRACTS.ssiRouter,
      blockedReason: HATCH_CONTRACTS.ssiRouter
        ? null
        : "SSI_ROUTER_ADDRESS not verified",
    },
    stake: {
      mode: HATCH_CONTRACTS.ssiStaking ? "onchain" : "ssi_earn_redirect",
      sMag7: TOKENS.sMag7Ssi,
    },
    balanceRefresh: ["GET /api/ssi/balances/:address", "GET /api/portfolio/:childId"],
    custody: false,
  };
}
