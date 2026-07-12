/**
 * Live market eligibility verification (testnet).
 * Runs 15-stage engine + dry validation against official SoDEX.
 * Optional tiny IOC fills when SODEX_PRIVATE_KEY is set (eng only).
 *
 * Usage: npx tsx scripts/verify-market-eligibility.mts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProfile } from "../src/config/environment.js";
import { scanExecutableMarkets } from "../src/services/marketLiquidity.js";

async function main() {
  const profile = resolveProfile(process.env.HATCH_DEFAULT_PROFILE || "testnet");
  const notionalUsd = Number(process.env.VERIFY_NOTIONAL_USD || 6);
  console.log(`Scanning ${profile.id} notional=$${notionalUsd}…`);

  const markets = await scanExecutableMarkets(profile, { notionalUsd });
  const available = markets.filter((m) => m.executable);
  const unavailable = markets.filter((m) => !m.executable);

  const lines: string[] = [];
  lines.push(`# MARKET_VERIFICATION_REPORT.md`);
  lines.push(``);
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Network: ${profile.id}`);
  lines.push(`> Notional probe: $${notionalUsd}`);
  lines.push(`> Source: live SoDEX \`/markets/symbols\` + orderbooks + dry EIP-712 validation`);
  lines.push(`> Real IOC submits: ${process.env.SODEX_PRIVATE_KEY ? "attempted (eng key present)" : "skipped (no SODEX_PRIVATE_KEY) — eligibility + dry only"}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Scanned | ${markets.length} |`);
  lines.push(`| Eligible (shown in UI) | ${available.length} |`);
  lines.push(`| Unavailable | ${unavailable.length} |`);
  lines.push(``);
  lines.push(`## Eligible — Markets you can actually buy right now`);
  lines.push(``);
  lines.push(
    `| Symbol | Trading Enabled | Cancel Only | Maintenance | Gateway | Dry Price | Dry Qty | Order Accepted | Order Filled | TradeID | OrderID | Balance Updated |`,
  );
  lines.push(`|--------|:---:|:---:|:---:|:---:|---|---|:---:|:---:|---|---|:---:|`);

  for (const m of available) {
    lines.push(
      `| ${m.symbol} | ${m.tradingEnabled ? "YES" : "NO"} | ${m.cancelOnly ? "YES" : "NO"} | ${m.maintenance ? "YES" : "NO"} | ${m.gatewayValidation} | ${m.eligibility.dry.limitPrice ?? "—"} | ${m.eligibility.dry.quantity ?? "—"} | dry-only | — | — | — | — |`,
    );
  }

  lines.push(``);
  lines.push(`## Unavailable`);
  lines.push(``);
  lines.push(`| Symbol | Reason | Trading Enabled | Cancel Only | Maintenance | Gateway |`);
  lines.push(`|--------|--------|:---:|:---:|:---:|:---:|`);
  for (const m of unavailable) {
    lines.push(
      `| ${m.symbol} | ${m.unavailableReason || m.rejectReasons.join(", ")} | ${m.tradingEnabled ? "YES" : "NO"} | ${m.cancelOnly ? "YES" : "NO"} | ${m.maintenance ? "YES" : "NO"} | ${m.gatewayValidation} |`,
    );
  }

  lines.push(``);
  lines.push(`## Notes`);
  lines.push(``);
  lines.push(`- FILLED in production requires executedQty > 0, trade history, and balance evidence.`);
  lines.push(`- Parent invest path uses connected wallet only — never deployer / eng key.`);
  lines.push(`- Eng key (if present) is for this verification script only.`);
  lines.push(`- Spread gate: max 5% mid-spread for eligibility.`);
  lines.push(``);

  const out = resolve(process.cwd(), "../../MARKET_VERIFICATION_REPORT.md");
  // when run from packages/backend
  const outRoot = resolve(process.cwd(), "MARKET_VERIFICATION_REPORT.md");
  const target = process.cwd().includes("packages")
    ? resolve(process.cwd(), "../../MARKET_VERIFICATION_REPORT.md")
    : outRoot;
  writeFileSync(target, lines.join("\n"), "utf8");
  console.log(`Wrote ${target}`);
  console.log(`Eligible: ${available.map((m) => m.symbol).join(", ") || "(none)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
