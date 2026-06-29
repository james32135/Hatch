/**
 * INTERNAL ENGINEERING — fund ValueChain testnet deployer with native SOSO gas.
 * Official flow (SoDEX docs):
 * 1. Faucet USDC (or use existing vUSDC on Spot) — https://testnet.sodex.com/faucet
 * 2. Buy WSOSO on Spot (WSOSO_vUSDC)
 * 3. POST /accounts/transfers EVM_WITHDRAW (toAccountID=999, type=2)
 * 4. If WSOSO ERC-20 received, unwrap to native SOSO (WETH-style withdraw)
 * 5. Send native SOSO to VALUECHAIN_DEPLOYER address
 * 6. forge script --broadcast on testnet
 *
 * Uses SODEX_* eng credentials only. Never for production parent funds.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const { engSignExchangeAction, engSodexAddress, engSodexAccountId } =
  await import("../src/services/engSodexSigner.js");
const { createSodexClient } = await import("../src/clients/sodex.js");
const { resolveProfile } = await import("../src/config/environment.js");
const { SODEX, VALUECHAIN } = await import("../src/config/addresses.js");
const {
  buildBatchNewOrderParams,
  SPOT_ACTION_BATCH_NEW,
  SPOT_TRADE_BATCH_PATH,
} = await import("../src/services/spotOrders.js");

const WSOSO_SYMBOL_ID = 4;
const WSOSO_COIN_ID = 4;
const WSOSO_TOKEN = "0x5050505050505050505050505050505050505050" as Address;
const EVM_WITHDRAW = 2;
const TRANSFER_ACTION = "transferAsset";
const TRANSFER_PATH = "/accounts/transfers";

const wethWithdrawAbi = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

function engPk(): Hex {
  const raw = process.env.SODEX_PRIVATE_KEY?.replace(/^"|"$/g, "");
  if (!raw) throw new Error("SODEX_PRIVATE_KEY missing");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

function deployerPk(): Hex {
  const raw = process.env.VALUECHAIN_DEPLOYER_PRIVATE_KEY?.replace(/^"|"$/g, "");
  if (!raw) throw new Error("VALUECHAIN_DEPLOYER_PRIVATE_KEY missing");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

const report: Record<string, unknown> = { steps: [] as unknown[] };
function step(name: string, data: unknown) {
  (report.steps as unknown[]).push({ name, data, at: new Date().toISOString() });
  console.log(JSON.stringify({ step: name, data }));
}

async function main() {
  const engAccount = privateKeyToAccount(engPk());
  const deployerAccount = privateKeyToAccount(deployerPk());
  const engAddr = engSodexAddress();
  const accountID = engSodexAccountId();
  const chainId = SODEX.testnet.chainId;
  const client = createSodexClient(resolveProfile("testnet"));
  const rpc = VALUECHAIN.testnet.rpcUrl;

  const publicClient = createPublicClient({
    chain: {
      id: chainId,
      name: "valuechain-testnet",
      nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    },
    transport: http(rpc),
  });
  const walletClient = createWalletClient({
    account: engAccount,
    chain: {
      id: chainId,
      name: "valuechain-testnet",
      nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
      rpcUrls: { default: { http: [rpc] } },
    },
    transport: http(rpc),
  });

  step("identities", {
    engSodex: engAddr,
    engViem: engAccount.address,
    deployer: deployerAccount.address,
    accountID,
  });

  const deployerBal0 = await publicClient.getBalance({
    address: deployerAccount.address,
  });
  step("deployer_balance_before", { wei: deployerBal0.toString(), soso: formatEther(deployerBal0) });
  if (deployerBal0 > parseEther("0.01")) {
    report.status = "already_funded";
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // 1) Buy WSOSO with vUSDC (LIMIT at ask-ish)
  const qty = "25";
  const price = "0.45";
  const clOrdID = `hatchgas${Date.now().toString(36)}`.slice(0, 36);
  const placeParams = buildBatchNewOrderParams({
    accountID,
    symbolID: WSOSO_SYMBOL_ID,
    clOrdID,
    side: 1,
    type: 1,
    timeInForce: 1,
    price,
    quantity: qty,
  });
  const placeSign = await engSignExchangeAction({
    scope: "spot",
    chainId,
    actionType: SPOT_ACTION_BATCH_NEW,
    params: placeParams,
    nonce: BigInt(Date.now()),
    network: "testnet",
    tradeAmountUsd: Number(price) * Number(qty),
  });
  const placeRes = await client.relay("POST", SPOT_TRADE_BATCH_PATH, placeParams, {
    apiSign: placeSign.apiSign,
    apiNonce: placeSign.nonce,
  });
  step("buy_wsoso", { status: placeRes.status, data: placeRes.data });

  // Wait briefly for fill / balance update
  await new Promise((r) => setTimeout(r, 3000));
  const state1 = (await client.accountState(engAddr)) as {
    data?: { B?: Array<{ a: string; t: string }> };
  };
  const wsosoBal = state1.data?.B?.find((b) => b.a === "WSOSO")?.t ?? "0";
  step("spot_wsoso_balance", { wsosoBal, balances: state1.data?.B });

  const withdrawAmt = Math.min(Number(wsosoBal), 20);
  if (!(withdrawAmt > 0)) {
    report.status = "no_wsoso_after_buy";
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  // Precision 18 for WSOSO — try exact formats until accepted
  const amountCandidates = [
    withdrawAmt.toFixed(18).replace(/\.?0+$/, "") || String(withdrawAmt),
    Number(wsosoBal) >= 10 ? "10" : wsosoBal,
    Number(wsosoBal) >= 5 ? "5" : wsosoBal,
    wsosoBal,
  ];

  let xferOk = false;
  for (const amount of amountCandidates) {
    const transferParams = {
      id: Date.now(),
      fromAccountID: accountID,
      toAccountID: 999,
      coinID: WSOSO_COIN_ID,
      amount: String(amount),
      type: EVM_WITHDRAW,
    };
    const xferSign = await engSignExchangeAction({
      scope: "spot",
      chainId,
      actionType: TRANSFER_ACTION,
      params: transferParams,
      nonce: BigInt(Date.now() + Math.floor(Math.random() * 1000)),
      network: "testnet",
      tradeAmountUsd: 0.01,
    });
    let xferRes = await client.relay("POST", TRANSFER_PATH, transferParams, {
      apiSign: xferSign.apiSign,
      apiNonce: xferSign.nonce,
    });
    const body = xferRes.data as { code?: number; error?: string };
    step("evm_withdraw_attempt", {
      status: xferRes.status,
      data: xferRes.data,
      transferParams,
    });
    if (body.code !== 0) {
      const altPath = `/accounts/${engAddr.toLowerCase()}/transferAsset`;
      xferRes = await client.relay("POST", altPath, transferParams, {
        apiSign: xferSign.apiSign,
        apiNonce: xferSign.nonce,
      });
      step("evm_withdraw_alt", {
        status: xferRes.status,
        data: xferRes.data,
        path: altPath,
      });
    }
    const okBody = xferRes.data as { code?: number };
    if (okBody.code === 0) {
      xferOk = true;
      break;
    }
  }
  if (!xferOk) {
    report.status = "evm_withdraw_failed";
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  await new Promise((r) => setTimeout(r, 5000));

  // 3) Check EVM balances; unwrap WSOSO if needed
  let native = await publicClient.getBalance({ address: engAccount.address });
  let wrapped = await publicClient.readContract({
    address: WSOSO_TOKEN,
    abi: wethWithdrawAbi,
    functionName: "balanceOf",
    args: [engAccount.address],
  });
  step("eng_evm_after_withdraw", {
    native: formatEther(native),
    wsosoErc20: formatEther(wrapped),
  });

  if (wrapped > 0n && native < parseEther("0.05")) {
    const hash = await walletClient.writeContract({
      address: WSOSO_TOKEN,
      abi: wethWithdrawAbi,
      functionName: "withdraw",
      args: [wrapped],
      chain: undefined,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    step("unwrap_wsoso", { hash, amount: formatEther(wrapped) });
    native = await publicClient.getBalance({ address: engAccount.address });
  }

  // 4) Send native SOSO to deployer
  native = await publicClient.getBalance({ address: engAccount.address });
  const sendAmt = native > parseEther("0.02") ? parseEther("0.05") : native / 2n;
  if (sendAmt <= 0n) {
    report.status = "no_native_soso_to_send";
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }
  // leave some for gas on eng
  const gasReserve = parseEther("0.002");
  const toSend = native > sendAmt + gasReserve ? sendAmt : native - gasReserve;
  if (toSend <= 0n) {
    report.status = "insufficient_after_gas_reserve";
    console.log(JSON.stringify(report, null, 2));
    process.exit(3);
  }

  const txHash = await walletClient.sendTransaction({
    to: deployerAccount.address,
    value: toSend,
    chain: undefined,
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  const deployerBal1 = await publicClient.getBalance({
    address: deployerAccount.address,
  });
  step("funded_deployer", {
    txHash,
    sent: formatEther(toSend),
    deployerBalance: formatEther(deployerBal1),
  });
  report.status = deployerBal1 > 0n ? "funded" : "fund_failed";
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "funded" ? 0 : 4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
