import { SODEX, VALUECHAIN } from "./addresses.js";

export type HatchProfileId = "mainnet" | "testnet" | "mainnet-readonly";

export interface HatchProfile {
  id: HatchProfileId;
  chainId: number;
  writesAllowed: boolean;
  sodexSpotRest: string;
  sodexSpotWs: string;
  sodexAppUrl: string;
  valuechainRpc: string;
  valuechainExplorer: string;
}

export const PROFILES: Record<HatchProfileId, HatchProfile> = {
  mainnet: {
    id: "mainnet",
    chainId: VALUECHAIN.mainnet.chainId,
    writesAllowed: true,
    sodexSpotRest: SODEX.mainnet.spotRest,
    sodexSpotWs: SODEX.mainnet.spotWs,
    sodexAppUrl: SODEX.mainnet.appUrl,
    valuechainRpc: VALUECHAIN.mainnet.rpcUrl,
    valuechainExplorer: VALUECHAIN.mainnet.explorerUrl,
  },
  testnet: {
    id: "testnet",
    chainId: VALUECHAIN.testnet.chainId,
    writesAllowed: true,
    sodexSpotRest: SODEX.testnet.spotRest,
    sodexSpotWs: SODEX.testnet.spotWs,
    sodexAppUrl: SODEX.testnet.appUrl,
    valuechainRpc: VALUECHAIN.testnet.rpcUrl,
    valuechainExplorer: VALUECHAIN.testnet.explorerUrl,
  },
  "mainnet-readonly": {
    id: "mainnet-readonly",
    chainId: VALUECHAIN.mainnet.chainId,
    writesAllowed: false,
    sodexSpotRest: SODEX.mainnet.spotRest,
    sodexSpotWs: SODEX.mainnet.spotWs,
    sodexAppUrl: SODEX.mainnet.appUrl,
    valuechainRpc: VALUECHAIN.mainnet.rpcUrl,
    valuechainExplorer: VALUECHAIN.mainnet.explorerUrl,
  },
};

export function resolveProfile(headerOrDefault?: string | null): HatchProfile {
  const raw = (headerOrDefault ?? process.env.HATCH_DEFAULT_PROFILE ?? "testnet").toLowerCase();
  if (raw === "mainnet" || raw === "testnet" || raw === "mainnet-readonly") {
    return PROFILES[raw];
  }
  return PROFILES.testnet;
}
