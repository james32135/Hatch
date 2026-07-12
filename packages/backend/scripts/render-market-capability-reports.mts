/**
 * Render human-reviewable reports from MARKET_PROBE_TESTNET.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Json = Record<string, unknown>;

type Outcome = {
  case: { kind: string; notionalUsd: number };
  gatewayHttpStatus: number | null;
  gatewayCode: number | null;
  gatewayError: string | null;
  gatewayAccepted: boolean;
  orderID: number | null;
  matcherAccepted: boolean;
  terminalStatus: string | null;
  executedQty: string | null;
  tradeIDs: number[];
  balanceIncreased: boolean | null;
  cancel: {
    attempted: boolean;
    accepted: boolean;
    code: number | null;
    error: string | null;
  };
  reason: string | null;
};

type Market = {
  symbol: string;
  displayName: string;
  internalId: number;
  status: string;
  legacyTradeSwitch: boolean | null;
  supportedOrderTypes: string | null;
  supportedTimeInForce: string | null;
  tickSize: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQuantity: string;
  marketMinQuantity: string;
  minNotional: string;
  stepSize: string;
  bestBid: string | null;
  bestAsk: string | null;
  websocketTickerPresent: boolean;
  outcomes: Outcome[];
};

type Probe = {
  generatedAt: string;
  mode: string;
  network: string;
  chainId: number;
  identity: Json;
  explorer: { endpoint: string; transactionCount: number };
  markets: Market[];
};

function ratio(count: number, total: number): string {
  if (total === 0) return "NOT RUN";
  return `${count === total ? "YES" : count === 0 ? "NO" : "PARTIAL"} (${count}/${total})`;
}

function escapeCell(value: unknown): string {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function summarize(market: Market) {
  const outcomes = market.outcomes;
  const reached = outcomes.filter((o) => o.gatewayHttpStatus !== null).length;
  const gateway = outcomes.filter((o) => o.gatewayAccepted).length;
  const matcher = outcomes.filter((o) => o.matcherAccepted).length;
  const filled = outcomes.filter((o) => o.tradeIDs.length > 0).length;
  const balanceProven = outcomes.filter(
    (o) => o.tradeIDs.length > 0 && o.balanceIncreased === true,
  ).length;
  const cancelAccepted = outcomes.filter(
    (o) => o.cancel.attempted && o.cancel.accepted,
  ).length;
  const errors = [
    ...new Set(
      outcomes
        .map((o) => o.gatewayError || o.reason)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const terminals = [
    ...new Set(
      outcomes
        .map((o) => o.terminalStatus)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const exactModes = ["LIMIT_IOC", "MARKET_IOC", "LIMIT_GTC"].map((kind) => {
    const rows = outcomes.filter((o) => o.case.kind === kind);
    return `${kind}:${rows.filter((o) => o.gatewayAccepted).length}/${rows.length}`;
  });
  const protocolAccepted =
    outcomes.length > 0 &&
    gateway === outcomes.length &&
    matcher === outcomes.length;
  const terminalExplained =
    outcomes.length > 0 &&
    outcomes.every(
      (o) =>
        o.tradeIDs.length > 0 ||
        ["CANCELED", "EXPIRED", "REJECTED", "FILLED"].includes(
          String(o.terminalStatus || "").toUpperCase(),
        ),
    );
  const fillEvidenceValid = outcomes.every(
    (o) => o.tradeIDs.length === 0 || o.balanceIncreased === true,
  );
  return {
    total: outcomes.length,
    reached,
    gateway,
    matcher,
    filled,
    balanceProven,
    cancelAccepted,
    errors,
    terminals,
    exactModes,
    protocolAccepted,
    terminalExplained,
    fillEvidenceValid,
  };
}

function main() {
  const root = resolve(process.cwd(), "../..");
  const source = resolve(root, "MARKET_PROBE_TESTNET.json");
  const probe = JSON.parse(readFileSync(source, "utf8")) as Probe;
  const rows = probe.markets.map((market) => ({
    market,
    summary: summarize(market),
  }));

  const matrix: string[] = [
    "# SoDEX Market Capability Matrix — Testnet",
    "",
    `Generated from signed probe: ${probe.generatedAt}`,
    `Network: ${probe.network} (chain ${probe.chainId})`,
    `Probe mode: ${probe.mode}`,
    "",
    "Each market was tested with $5 and $10 LIMIT IOC, MARKET IOC, and LIMIT GTC. Accepted resting GTC orders were canceled. Exact requests, order IDs, trade IDs, balances, and gateway responses are retained in `MARKET_PROBE_TESTNET.json`.",
    "",
    "## Execution matrix",
    "",
    "| Symbol | ID | REST status | Web switch | WS ticker | Can relay | Gateway accepted | Matcher accepted | Can fill | Modes accepted | Terminal states | Reason |",
    "|---|---:|---|:---:|:---:|---|---|---|---|---|---|---|",
  ];

  for (const { market, summary } of rows) {
    matrix.push(
      `| ${escapeCell(market.symbol)} | ${market.internalId} | ${escapeCell(market.status)} | ${market.legacyTradeSwitch ? "YES" : "NO"} | ${market.websocketTickerPresent ? "YES" : "NO"} | ${ratio(summary.reached, summary.total)} | ${ratio(summary.gateway, summary.total)} | ${ratio(summary.matcher, summary.total)} | ${summary.filled > 0 ? `YES (${summary.filled}/${summary.total}; balance ${summary.balanceProven}/${summary.filled})` : "NO"} | ${escapeCell(summary.exactModes.join(", "))} | ${escapeCell(summary.terminals.join(", ") || "none")} | ${escapeCell(summary.errors.join("; ") || "none")} |`,
    );
  }

  matrix.push(
    "",
    "## Metadata and filter matrix",
    "",
    "| Symbol | Order types | TIF | Tick | Price precision | Quantity precision | Step | Min quantity | Market min quantity | Min notional | Best bid | Best ask |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const { market } of rows) {
    matrix.push(
      `| ${escapeCell(market.symbol)} | ${escapeCell(market.supportedOrderTypes)} | ${escapeCell(market.supportedTimeInForce)} | ${escapeCell(market.tickSize)} | ${market.pricePrecision} | ${market.quantityPrecision} | ${escapeCell(market.stepSize)} | ${escapeCell(market.minQuantity)} | ${escapeCell(market.marketMinQuantity)} | ${escapeCell(market.minNotional)} | ${escapeCell(market.bestBid)} | ${escapeCell(market.bestAsk)} |`,
    );
  }

  matrix.push(
    "",
    "## Interpretation",
    "",
    "- `Can relay` means a signed request reached the SoDEX write endpoint and received an HTTP response.",
    "- `Gateway accepted` requires top-level code zero, per-order success, and an order ID.",
    "- `Matcher accepted` requires the returned order to appear in official open/history state.",
    "- `Can fill` requires at least one official trade ID; balance evidence is shown separately.",
    "- REST `TRADING`, web `tradeSwitch`, book depth, and websocket presence are descriptive only.",
    "- Explorer account transaction count for this wallet was " +
      probe.explorer.transactionCount +
      "; strict explorer-confirmed safe-list status is therefore not established.",
    "",
  );

  writeFileSync(
    resolve(root, "MARKET_CAPABILITY_MATRIX.md"),
    `${matrix.join("\n")}\n`,
    "utf8",
  );

  const safeRows = rows.filter(({ summary }) => {
    return (
      summary.protocolAccepted &&
      summary.terminalExplained &&
      summary.fillEvidenceValid &&
      probe.explorer.transactionCount > 0
    );
  });
  const executionCapable = rows.filter(
    ({ summary }) => summary.protocolAccepted && summary.terminalExplained,
  );
  const safe: string[] = [
    "# Verified Safe Markets — Testnet",
    "",
    `Generated: ${probe.generatedAt}`,
    "",
    "## Safe list",
    "",
    safeRows.length === 0
      ? "**Empty.**"
      : safeRows.map(({ market }) => `- ${market.symbol}`).join("\n"),
    "",
    "A market qualifies only when gateway acceptance, matcher acceptance, terminal-state reconciliation, fill evidence, and explorer confirmation all pass.",
    "",
    "## Execution-capable but not fully safe",
    "",
  ];
  if (executionCapable.length === 0) {
    safe.push("None.");
  } else {
    for (const { market, summary } of executionCapable) {
      safe.push(
        `- ${market.symbol}: gateway ${summary.gateway}/${summary.total}, matcher ${summary.matcher}/${summary.total}, fills ${summary.filled}/${summary.total}, balance-proven fills ${summary.balanceProven}/${summary.filled}. Blocked from safe list because explorer confirmation is absent.`,
      );
    }
  }
  safe.push(
    "",
    "## Rejected or incompletely verified",
    "",
  );
  for (const { market, summary } of rows.filter(
    ({ summary }) => !summary.protocolAccepted || !summary.terminalExplained,
  )) {
    safe.push(
      `- ${market.symbol}: gateway ${summary.gateway}/${summary.total}, matcher ${summary.matcher}/${summary.total}; ${summary.errors.join("; ") || "terminal state incomplete"}.`,
    );
  }
  safe.push(
    "",
    "## Explorer blocker",
    "",
    `Official endpoint: ${probe.explorer.endpoint}`,
    "",
    `Observed account transaction rows: ${probe.explorer.transactionCount}`,
    "",
    "Official SoDEX order/trade APIs contain fills for this wallet, but the explorer account endpoint does not expose their transaction linkage. Under the required strict criteria, the application must show no verified-safe testnet markets until that linkage is proven.",
    "",
  );
  writeFileSync(
    resolve(root, "SAFE_MARKETS_TESTNET.md"),
    `${safe.join("\n")}\n`,
    "utf8",
  );
}

main();
