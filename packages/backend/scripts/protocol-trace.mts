/**
 * PROTOCOL TRACE — one complete HATCH-shaped investment attempt on SoDEX testnet.
 * Uses SODEX_PRIVATE_KEY (same wallet as parent Practice) — eng path only for evidence capture.
 * Does NOT invent outcomes. Stops documenting after first hard failure.
 */
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { keccak256, stringToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../../.env") });

const SPOT = "https://testnet-gw.sodex.dev/api/v1/spot";
const CHAIN_ID = 138565;
const ACCOUNT_ID = Number(process.env.SODEX_ACCOUNT_ID);
const ADDR = String(process.env.SODEX_ADDRESS).replace(/"/g, "").toLowerCase();
const PK = (process.env.SODEX_PRIVATE_KEY!.startsWith("0x")
  ? process.env.SODEX_PRIVATE_KEY!
  : `0x${process.env.SODEX_PRIVATE_KEY!}`) as Hex;

type Step = {
  n: number;
  name: string;
  timestamp: string;
  latencyMs?: number;
  status: "ok" | "fail" | "info";
  http?: { method: string; url: string; headers?: Record<string, string>; body?: unknown };
  response?: { status?: number; headers?: Record<string, string>; json?: unknown; text?: string };
  note?: string;
  stop?: boolean;
};

const steps: Step[] = [];
const t0 = Date.now();

function ts() {
  return new Date().toISOString();
}

function log(step: Step) {
  steps.push(step);
  console.log(`[${step.n}] ${step.status.toUpperCase()} ${step.name} (${step.latencyMs ?? 0}ms)`);
  if (step.stop) console.log("STOP:", step.note);
}

async function httpJson(
  method: string,
  url: string,
  opts?: { headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; json: unknown; text: string; latencyMs: number; resHeaders: Record<string, string> }> {
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(opts?.body ? { "content-type": "application/json" } : {}),
      ...(opts?.headers || {}),
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });
  return { status: res.status, json, text, latencyMs: Date.now() - started, resHeaders };
}

function payloadHashFromAction(type: string, params: unknown): Hex {
  return keccak256(stringToBytes(JSON.stringify({ type, params })));
}

function normalizeEcdsaV(signature: Hex): Hex {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130) return signature;
  let v = Number.parseInt(raw.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  return `0x${raw.slice(0, 128)}${v.toString(16).padStart(2, "0")}` as Hex;
}

async function main() {
  mkdirSync(resolve(__dirname, "../../../artifacts"), { recursive: true });

  // ── 0 meta ──────────────────────────────────────────────
  log({
    n: 0,
    name: "trace_meta",
    timestamp: ts(),
    status: "info",
    note: `wallet=${ADDR} accountID=${ACCOUNT_ID} chainId=${CHAIN_ID} gateway=${SPOT} elapsed0=${Date.now() - t0}`,
  });

  if (!ACCOUNT_ID || !ADDR || !PK) {
    log({
      n: 0,
      name: "env_check",
      timestamp: ts(),
      status: "fail",
      note: "Missing SODEX_ADDRESS / SODEX_ACCOUNT_ID / SODEX_PRIVATE_KEY",
      stop: true,
    });
    dump();
    return;
  }

  // ── 13 Orderbook BEFORE ─────────────────────────────────
  const bookBefore = await httpJson("GET", `${SPOT}/markets/vMAG7ssi_vUSDC/orderbook?limit=20`);
  log({
    n: 13,
    name: "orderbook_BEFORE_vMAG7ssi_vUSDC",
    timestamp: ts(),
    latencyMs: bookBefore.latencyMs,
    status: bookBefore.status === 200 ? "ok" : "fail",
    http: { method: "GET", url: `${SPOT}/markets/vMAG7ssi_vUSDC/orderbook?limit=20` },
    response: { status: bookBefore.status, json: bookBefore.json },
    stop: bookBefore.status !== 200,
  });
  if (bookBefore.status !== 200) {
    dump();
    return;
  }

  const bookData = (bookBefore.json as any)?.data;
  const asksBefore = bookData?.asks || [];
  const bidsBefore = bookData?.bids || [];

  // ── balances BEFORE ─────────────────────────────────────
  const balBefore = await httpJson("GET", `${SPOT}/accounts/${ADDR}/balances`);
  log({
    n: 11,
    name: "balances_BEFORE",
    timestamp: ts(),
    latencyMs: balBefore.latencyMs,
    status: balBefore.status === 200 ? "ok" : "fail",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/balances` },
    response: { status: balBefore.status, json: balBefore.json },
    stop: balBefore.status !== 200,
  });
  if (balBefore.status !== 200) {
    dump();
    return;
  }

  // ── account state BEFORE ────────────────────────────────
  const stateBefore = await httpJson("GET", `${SPOT}/accounts/${ADDR}/state`);
  log({
    n: 12,
    name: "account_state_BEFORE",
    timestamp: ts(),
    latencyMs: stateBefore.latencyMs,
    status: stateBefore.status === 200 ? "ok" : "fail",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/state` },
    response: { status: stateBefore.status, json: stateBefore.json },
    stop: stateBefore.status !== 200,
  });
  if (stateBefore.status !== 200) {
    dump();
    return;
  }

  // ── tickers for mid (HATCH draft behavior) ──────────────
  const tickers = await httpJson("GET", `${SPOT}/markets/tickers`);
  const mag7T = ((tickers.json as any)?.data || []).find((t: any) => t.symbol === "vMAG7ssi_vUSDC");
  log({
    n: 0,
    name: "ticker_vMAG7ssi_vUSDC",
    timestamp: ts(),
    latencyMs: tickers.latencyMs,
    status: mag7T ? "ok" : "fail",
    response: { status: tickers.status, json: mag7T || null },
    note: mag7T
      ? `lastPx=${mag7T.lastPx} bidPx=${mag7T.bidPx} askPx=${mag7T.askPx} askSz=${mag7T.askSz}`
      : "ticker missing",
    stop: !mag7T,
  });
  if (!mag7T) {
    dump();
    return;
  }

  // HATCH Balanced $6 collapse → single MAG7 leg sized like parentSignDraft sizeLimitBuy
  // mid = lastPx (HATCH uses live mid from tickers)
  const mid = Number(mag7T.lastPx || mag7T.bidPx);
  const notionalUsd = 6;
  const minNotional = 5;
  const step = 0.01;
  const rawQty = Math.max(notionalUsd / mid, minNotional / mid);
  const qty = (Math.ceil(rawQty / step - 1e-12) * step).toFixed(2);
  // HATCH: LIMIT IOC at mid — SoDEX-accepted format (strip trailing zeros; never toFixed pad)
  const price = mid.toFixed(4).replace(/\.?0+$/, "") || "0";
  const clOrdID = `hmtrace${Date.now().toString(36)}`.slice(0, 36);
  const symbolID = 3; // live testnet id for vMAG7ssi_vUSDC

  // ── 1 Unsigned payload ──────────────────────────────────
  const params = {
    accountID: ACCOUNT_ID,
    orders: [
      {
        symbolID,
        clOrdID,
        side: 1,
        type: 1,
        timeInForce: 3,
        price,
        quantity: qty,
      },
    ],
  };
  const actionType = "batchNewOrder";
  const envelope = { type: actionType, params };
  const envelopeJson = JSON.stringify(envelope);
  const payloadHash = payloadHashFromAction(actionType, params);
  const nonce = BigInt(Date.now());

  log({
    n: 1,
    name: "unsigned_payload",
    timestamp: ts(),
    status: "info",
    http: {
      method: "N/A",
      url: "local EIP-712 construction (HATCH parentSignDraft shape)",
      body: {
        envelope,
        envelopeJson,
        payloadHash,
        nonce: nonce.toString(),
        domain: {
          name: "spot",
          version: "1",
          chainId: CHAIN_ID,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        primaryType: "ExchangeAction",
        message: { payloadHash, nonce: nonce.toString() },
        hatchSizing: {
          notionalUsd,
          mid,
          price,
          quantity: qty,
          symbolID,
          symbol: "vMAG7ssi_vUSDC",
          type: "LIMIT=1",
          timeInForce: "IOC=3",
          asksBeforeCount: asksBefore.length,
          bidsBeforeCount: bidsBefore.length,
        },
      },
    },
    note: `asksBefore=${JSON.stringify(asksBefore)} bidsTop=${JSON.stringify(bidsBefore.slice(0, 2))}`,
  });

  // ── 2 Signed EIP-712 ────────────────────────────────────
  const account = privateKeyToAccount(PK);
  if (account.address.toLowerCase() !== ADDR) {
    log({
      n: 2,
      name: "signed_eip712",
      timestamp: ts(),
      status: "fail",
      note: `Key address ${account.address} != SODEX_ADDRESS ${ADDR}`,
      stop: true,
    });
    dump();
    return;
  }

  const sigStarted = Date.now();
  const rawSig = await account.signTypedData({
    domain: {
      name: "spot",
      version: "1",
      chainId: CHAIN_ID,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      ExchangeAction: [
        { name: "payloadHash", type: "bytes32" },
        { name: "nonce", type: "uint64" },
      ],
    },
    primaryType: "ExchangeAction",
    message: { payloadHash, nonce },
  });
  const apiSign = `0x01${normalizeEcdsaV(rawSig).slice(2)}`;
  log({
    n: 2,
    name: "signed_eip712",
    timestamp: ts(),
    latencyMs: Date.now() - sigStarted,
    status: "ok",
    response: {
      json: {
        rawSig,
        apiSign,
        signer: account.address,
        payloadHash,
        nonce: nonce.toString(),
      },
    },
  });

  // ── 3 Relay request (HATCH SodexClient.relay headers — NO X-API-Chain) ──
  const hatchHeaders = {
    accept: "application/json",
    "content-type": "application/json",
    "X-API-Sign": apiSign,
    "X-API-Nonce": nonce.toString(),
  };
  const relayUrl = `${SPOT}/trade/orders/batch`;
  log({
    n: 3,
    name: "relay_request_HATCH_headers",
    timestamp: ts(),
    status: "info",
    http: {
      method: "POST",
      url: relayUrl,
      headers: {
        ...hatchHeaders,
        "X-API-Sign": `${apiSign.slice(0, 18)}…`,
      },
      body: params,
    },
    note: "HATCH packages/backend/src/clients/sodex.ts relay() — does NOT send X-API-Chain",
  });

  // ── 4+5 Relay / exchange response ───────────────────────
  const relay = await httpJson("POST", relayUrl, { headers: hatchHeaders, body: params });
  const relayJson = relay.json as any;
  const legs = Array.isArray(relayJson?.data) ? relayJson.data : [];
  const topCode = relayJson?.code;
  const firstLeg = legs[0];

  log({
    n: 4,
    name: "relay_response_HTTP",
    timestamp: ts(),
    latencyMs: relay.latencyMs,
    status: relay.status >= 200 && relay.status < 300 ? "ok" : "fail",
    http: { method: "POST", url: relayUrl },
    response: {
      status: relay.status,
      headers: relay.resHeaders,
      json: relay.json,
      text: relay.text.slice(0, 4000),
    },
    stop: relay.status >= 300,
  });
  if (relay.status >= 300) {
    dump();
    return;
  }

  log({
    n: 5,
    name: "exchange_response_JSON",
    timestamp: ts(),
    status: topCode === 0 ? "ok" : "fail",
    response: { json: relayJson },
    note: `topCode=${topCode} timestamp=${relayJson?.timestamp}`,
    stop: topCode !== 0,
  });
  if (topCode !== 0) {
    dump();
    return;
  }

  // ── 6 Batch leg responses ───────────────────────────────
  log({
    n: 6,
    name: "batch_leg_responses",
    timestamp: ts(),
    status: firstLeg && firstLeg.code === 0 ? "ok" : "fail",
    response: { json: legs },
    note: firstLeg
      ? `leg0.code=${firstLeg.code} orderID=${firstLeg.orderID} clOrdID=${firstLeg.clOrdID}`
      : "no legs in data[]",
    stop: !firstLeg || firstLeg.code !== 0,
  });
  if (!firstLeg || firstLeg.code !== 0) {
    dump();
    return;
  }

  // ── 7+8 Order IDs ───────────────────────────────────────
  log({
    n: 7,
    name: "returned_order_ids",
    timestamp: ts(),
    status: firstLeg.orderID != null ? "ok" : "fail",
    response: { json: { orderID: firstLeg.orderID, all: legs.map((l: any) => l.orderID) } },
    stop: firstLeg.orderID == null,
  });
  if (firstLeg.orderID == null) {
    dump();
    return;
  }

  log({
    n: 8,
    name: "returned_client_order_ids",
    timestamp: ts(),
    status: "ok",
    response: { json: { clOrdID: firstLeg.clOrdID || clOrdID, sent: clOrdID } },
  });

  // ── 14 Orderbook AFTER ──────────────────────────────────
  await new Promise((r) => setTimeout(r, 1500));
  const bookAfter = await httpJson("GET", `${SPOT}/markets/vMAG7ssi_vUSDC/orderbook?limit=20`);
  log({
    n: 14,
    name: "orderbook_AFTER_vMAG7ssi_vUSDC",
    timestamp: ts(),
    latencyMs: bookAfter.latencyMs,
    status: "ok",
    response: { status: bookAfter.status, json: bookAfter.json },
  });

  // ── 9 Order history ─────────────────────────────────────
  const hist = await httpJson(
    "GET",
    `${SPOT}/accounts/${ADDR}/orders/history?limit=50`,
  );
  const histRows = Array.isArray((hist.json as any)?.data) ? (hist.json as any).data : [];
  const matched = histRows.filter(
    (r: any) =>
      String(r.orderID) === String(firstLeg.orderID) ||
      String(r.clOrdID) === String(clOrdID),
  );
  log({
    n: 9,
    name: "GET_orders_history",
    timestamp: ts(),
    latencyMs: hist.latencyMs,
    status: hist.status === 200 ? "ok" : "fail",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/orders/history?limit=50` },
    response: {
      status: hist.status,
      json: { matched, recent5: histRows.slice(0, 5) },
    },
    note:
      matched.length === 0
        ? "NO matching row yet for this orderID/clOrdID"
        : `matched status=${matched[0]?.status} executedQty=${matched[0]?.executedQty}`,
  });

  // Poll up to ~20s if not found / not terminal
  let finalHist = matched[0] || null;
  if (!finalHist || !["FILLED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(String(finalHist.status))) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const h2 = await httpJson("GET", `${SPOT}/accounts/${ADDR}/orders/history?limit=50`);
      const rows = Array.isArray((h2.json as any)?.data) ? (h2.json as any).data : [];
      const m = rows.find(
        (r: any) =>
          String(r.orderID) === String(firstLeg.orderID) ||
          String(r.clOrdID) === String(clOrdID),
      );
      log({
        n: 9,
        name: `GET_orders_history_poll_${i + 1}`,
        timestamp: ts(),
        latencyMs: h2.latencyMs,
        status: "info",
        response: { json: m || null },
        note: m ? `status=${m.status} executedQty=${m.executedQty}` : "still missing",
      });
      if (m) {
        finalHist = m;
        if (["FILLED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(String(m.status))) break;
      }
    }
  }

  // ── 10 Trades ───────────────────────────────────────────
  const trades = await httpJson(
    "GET",
    `${SPOT}/accounts/${ADDR}/trades?orderID=${firstLeg.orderID}&limit=50`,
  );
  log({
    n: 10,
    name: "GET_trades",
    timestamp: ts(),
    latencyMs: trades.latencyMs,
    status: trades.status === 200 ? "ok" : "fail",
    http: {
      method: "GET",
      url: `${SPOT}/accounts/${ADDR}/trades?orderID=${firstLeg.orderID}&limit=50`,
    },
    response: { status: trades.status, json: trades.json },
  });

  // ── balances AFTER ──────────────────────────────────────
  const balAfter = await httpJson("GET", `${SPOT}/accounts/${ADDR}/balances`);
  log({
    n: 11,
    name: "balances_AFTER",
    timestamp: ts(),
    latencyMs: balAfter.latencyMs,
    status: "ok",
    response: { status: balAfter.status, json: balAfter.json },
  });

  // ── account state AFTER ─────────────────────────────────
  const stateAfter = await httpJson("GET", `${SPOT}/accounts/${ADDR}/state`);
  log({
    n: 12,
    name: "account_state_AFTER",
    timestamp: ts(),
    latencyMs: stateAfter.latencyMs,
    status: "ok",
    response: { status: stateAfter.status, json: stateAfter.json },
  });

  // ── 15 Explorer — ValueChain has no per-CLOB-fill tx; document SoDEX app URL ──
  log({
    n: 15,
    name: "explorer_records",
    timestamp: ts(),
    status: "info",
    note: "SoDEX spot CLOB fills are not EVM txs. Proof surface = SoDEX Portfolio / REST history. Testnet app: https://testnet.sodex.com/portfolio ValueChain explorer does not list CLOB matches as transfers.",
    response: {
      json: {
        sodexPortfolio: "https://testnet.sodex.com/portfolio",
        valuechainExplorer: "https://test-scan.valuechain.xyz",
        orderID: firstLeg.orderID,
        clOrdID,
      },
    },
  });

  // ── 16 DB rows — this script bypasses HATCH API; note absence ──
  log({
    n: 16,
    name: "database_rows",
    timestamp: ts(),
    status: "info",
    note: "This evidence capture called SoDEX gateway directly with HATCH-identical body+headers (eng key). No HATCH Prisma signed_orders row was written. For DB proof, capture production /api/sodex/relay response signedOrderId after parent MetaMask sign.",
  });

  // ── 17 Timeline ─────────────────────────────────────────
  log({
    n: 17,
    name: "timeline_events",
    timestamp: ts(),
    status: "info",
    response: {
      json: {
        finalHistoryStatus: finalHist?.status ?? null,
        executedQty: finalHist?.executedQty ?? null,
        executedValue: finalHist?.executedValue ?? null,
        tradesCount: Array.isArray((trades.json as any)?.data)
          ? (trades.json as any).data.length
          : 0,
        fillProven: String(finalHist?.status) === "FILLED",
      },
    },
  });

  // ── 18 Stop decision ────────────────────────────────────
  const filled = String(finalHist?.status) === "FILLED";
  const expired =
    ["EXPIRED", "CANCELED", "CANCELLED", "REJECTED"].includes(String(finalHist?.status)) &&
    !(Number(finalHist?.executedQty) > 0);

  log({
    n: 18,
    name: "conclusion",
    timestamp: ts(),
    status: filled ? "ok" : "fail",
    note: filled
      ? "FILLED proven via orders/history"
      : expired
        ? `Terminal non-fill status=${finalHist?.status} executedQty=${finalHist?.executedQty}. STOP — do not claim investment success.`
        : `Unresolved status=${finalHist?.status ?? "MISSING_FROM_HISTORY"}. STOP.`,
    stop: !filled,
    response: {
      json: {
        asksBeforeEmpty: asksBefore.length === 0,
        hatchPriceAtMid: price,
        mid,
        orderID: firstLeg.orderID,
        history: finalHist,
      },
    },
  });

  // Optional controlled contrast: same wallet, USSI with sosomind-style slip IF MAG7 failed
  // Only as APPENDIX evidence — not continuation of the failed MAG7 investment claim.
  if (!filled) {
    log({
      n: 19,
      name: "APPENDIX_not_continuation",
      timestamp: ts(),
      status: "info",
      note: "Primary MAG7 attempt did not FILLED. Appendix will separately probe USSI liquidity with sosomind-style buy slip for comparison ONLY.",
    });
  }

  dump();
}

function dump() {
  const out = {
    generatedAt: new Date().toISOString(),
    wallet: ADDR,
    accountID: ACCOUNT_ID,
    chainId: CHAIN_ID,
    gateway: SPOT,
    steps,
  };
  const path = resolve(__dirname, "../../../artifacts/protocol_trace_raw.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("Wrote", path);
}

main().catch((e) => {
  console.error(e);
  log({
    n: 99,
    name: "uncaught",
    timestamp: ts(),
    status: "fail",
    note: String(e),
    stop: true,
  });
  dump();
  process.exit(1);
});
