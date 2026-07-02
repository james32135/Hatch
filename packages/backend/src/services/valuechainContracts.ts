/**
 * ValueChain HATCH contract reads (mainnet/testnet).
 * No custody — read deployer + optional schedule view.
 */
import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { HATCH_CONTRACTS, VALUECHAIN } from "../config/addresses.js";

const hatchLogAbi = [
  {
    type: "function",
    name: "deployer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "deployedAt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const hatchScheduleAbi = [
  {
    type: "function",
    name: "deployer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "getPolicy",
    stateMutability: "view",
    inputs: [{ name: "childId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "policyHash", type: "bytes32" },
          { name: "nextDueAt", type: "uint64" },
          { name: "paused", type: "bool" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
] as const;

export function valuechainClient(
  network: "mainnet" | "testnet",
): PublicClient {
  const rpc =
    network === "mainnet"
      ? VALUECHAIN.mainnet.rpcUrl
      : VALUECHAIN.testnet.rpcUrl;
  const chainId =
    network === "mainnet"
      ? VALUECHAIN.mainnet.chainId
      : VALUECHAIN.testnet.chainId;
  return createPublicClient({
    chain: {
      id: chainId,
      name: `valuechain-${network}`,
      nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    },
    transport: http(rpc),
  }) as PublicClient;
}

export async function verifyHatchContracts(network: "mainnet" | "testnet") {
  const contracts = HATCH_CONTRACTS[network];
  const client = valuechainClient(network);
  const warnings: string[] = [];

  if (!contracts.log) {
    return {
      ok: false,
      network,
      error: "HATCH_LOG_ADDRESS not set for network",
      warnings,
    };
  }

  const logAddr = contracts.log as Address;
  const code = await client.getBytecode({ address: logAddr });
  if (!code || code === "0x") {
    return { ok: false, network, error: "HATCHLog bytecode missing", warnings };
  }

  const deployer = await client.readContract({
    address: logAddr,
    abi: hatchLogAbi,
    functionName: "deployer",
  });
  const deployedAt = await client.readContract({
    address: logAddr,
    abi: hatchLogAbi,
    functionName: "deployedAt",
  });

  let schedule: {
    address: string;
    deployer?: string;
    bytecode: boolean;
  } | null = null;
  if (contracts.schedule) {
    const schAddr = contracts.schedule as Address;
    const schCode = await client.getBytecode({ address: schAddr });
    const schDeployer =
      schCode && schCode !== "0x"
        ? await client.readContract({
            address: schAddr,
            abi: hatchScheduleAbi,
            functionName: "deployer",
          })
        : undefined;
    schedule = {
      address: schAddr,
      deployer: schDeployer,
      bytecode: !!(schCode && schCode !== "0x"),
    };
    if (!schedule.bytecode) warnings.push("HATCHSchedule bytecode missing");
  } else {
    warnings.push("HATCHSchedule address not set");
  }

  return {
    ok: true,
    network,
    chainId:
      network === "mainnet"
        ? VALUECHAIN.mainnet.chainId
        : VALUECHAIN.testnet.chainId,
    hatchLog: {
      address: logAddr,
      deployer,
      deployedAt: deployedAt.toString(),
      bytecode: true,
      upgradeable: false,
      custody: false,
    },
    hatchSchedule: schedule,
    explorer: {
      log: `${VALUECHAIN[network].explorerUrl}/address/${logAddr}`,
      schedule: contracts.schedule
        ? `${VALUECHAIN[network].explorerUrl}/address/${contracts.schedule}`
        : null,
    },
    warnings,
  };
}

export async function readSchedulePolicy(
  network: "mainnet" | "testnet",
  childId: Hex,
) {
  const addr = HATCH_CONTRACTS[network].schedule as Address | "";
  if (!addr) throw new Error("HATCHSchedule address missing");
  const client = valuechainClient(network);
  return client.readContract({
    address: addr,
    abi: hatchScheduleAbi,
    functionName: "getPolicy",
    args: [childId],
  });
}
