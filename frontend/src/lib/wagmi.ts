import { http, createConfig } from "wagmi";
import { mainnet, base } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import type { Chain } from "viem";

export const valueChainMainnet: Chain = {
  id: 286623,
  name: "ValueChain",
  nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.valuechain.xyz"] } },
  blockExplorers: { default: { name: "ValueChain Scan", url: "https://main-scan.valuechain.xyz" } },
};

export const valueChainTestnet: Chain = {
  id: 138565,
  name: "ValueChain Testnet",
  nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-v2.valuechain.xyz"] } },
  blockExplorers: { default: { name: "ValueChain Testnet Scan", url: "https://test-scan.valuechain.xyz" } },
};

const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export const wagmiConfig = createConfig({
  chains: [mainnet, base, valueChainMainnet, valueChainTestnet],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(wcProjectId
      ? [walletConnect({ projectId: wcProjectId, showQrModal: true, metadata: { name: "HATCH", description: "Your child's first portfolio", url: typeof window !== "undefined" ? window.location.origin : "https://hatch.app", icons: [] } })]
      : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [valueChainMainnet.id]: http("https://mainnet.valuechain.xyz"),
    [valueChainTestnet.id]: http("https://testnet-v2.valuechain.xyz"),
  },
  ssr: false,
});
