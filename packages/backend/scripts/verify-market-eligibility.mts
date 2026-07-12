/**
 * Live market eligibility verification (testnet).
 * Public reads + dry validation + signed capability seed (no live submits here).
 * For real signed writes use probe-sodex-market-capabilities.mts.
 *
 * Usage: npx tsx scripts/verify-market-eligibility.mts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProfile } from "../src/config/environment.js";
import { scanExecutableMarkets } from "../src/services/marketLiquidity.js";
import { reloadCapabilitiesFromProbe } from "../src/services/marketCapability.js";

async function main() {
  const profile = resolveProfile(process.env.HATCH_DEFAULT_PROFILE || "testnet");
  const notionalUsd = Number(process.env.VERIFY_NOTIONAL_USD || 6);
  const network = profile.id === "mainnet" ? "mainnet" : "testnet";
  const seeded = await reloadCapabilitiesFromProbe(network);
  console.log(`Scanning ${profile.id} notional=$${notionalUsd} (capability seed rows=${seeded})…`);

  const markets = await scanExecutableMarkets(profile, { notionalUsd });
  const available = markets.filter((m) => m.executable);
  const unavailable = markets.filter((m) => !m.executable);

  const lines: string[] = [];
  lines.push(`# MARKET_VERIFICATION_REPORT.md`);
  lines.push(``);
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Network: ${profile.id}`);
  lines.push(`> Notional probe: $${notionalUsd}`);
  lines.push(
    `> Source: live SoDEX \`/markets/symbols\` + orderbooks + dry EIP-712 + signed capability records`,
  );
  lines.push(
    `> Real IOC submits: not performed by this script — use \`probe-sodex-market-capabilities.mts\` for signed writes`,
  );
  lines.push(`> Capability seed rows: ${seeded}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Scanned | ${markets.length} |`);
  lines.push(`| Matcher-capable (shown in UI) | ${available.length} |`);
  lines.push(`| Unavailable | ${unavailable.length} |`);
  lines.push(``);
  lines.push(`## Matcher-capable — markets with signed evidence`);
  lines.push(``);
  lines.push(
    `| Symbol | Trading Enabled | Cancel Only | Capability | Dry Price | Dry Qty | Matcher | Fill proven | TradeIDs | OrderIDs | verifiedSafe |`,
  );
  lines.push(
    `|--------|:---:|:---:|:---:|---|---|:---:|:---:|---|---|:---:|`,
  );

  for (const m of available) {
    const cap = m.eligibility.capability;
    lines.push(
      `| ${m.symbol} | ${m.tradingEnabled ? "YES" : "NO"} | ${m.cancelOnly ? "YES" : "NO"} | ${m.gatewayValidation} | ${m.eligibility.dry.limitPrice ?? "—"} | ${m.eligibility.dry.quantity ?? "—"} | ${m.matcherCapable ? "YES" : "NO"} | ${m.fillCapable ? "YES" : "NO"} | ${(cap?.tradeIDs || []).join(",") || "—"} | ${(cap?.orderIDs || []).join(",") || "—"} | NO |`,
    );
  }

  lines.push(``);
  lines.push(`## Unavailable`);
  lines.push(``);
  lines.push(
    `| Symbol | Reason | Trading Enabled | Cancel Only | Maintenance | Capability |`,
  );
  lines.push(`|--------|--------|:---:|:---:|:---:|:---:|`);
  for (const m of unavailable) {
    lines.push(
      `| ${m.symbol} | ${m.unavailableReason || m.rejectReasons.join(",") || "—"} | ${m.tradingEnabled ? "YES" : "NO"} | ${m.cancelOnly ? "YES" : "NO"} | ${m.maintenance ? "YES" : "NO"} | ${m.gatewayValidation} |`,
    );
  }

  lines.push(``);
  lines.push(`## Notes`);
  lines.push(``);
  lines.push(
    `- FILLED in production requires executedQty > 0, trade history, and balance evidence.`,
  );
  lines.push(
    `- \`verifiedSafe\` stays NO until explorer wallet transactions map to fills (GAP-5).`,
  );
  lines.push(
    `- This report never claims live IOC submits; signed evidence comes from capability records / probe artifact.`,
  );

  const target = process.cwd().includes("packages")
    ? resolve(process.cwd(), "../../MARKET_VERIFICATION_REPORT.md")
    : resolve(process.cwd(), "MARKET_VERIFICATION_REPORT.md");
  writeFileSync(target, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${target}`);
  console.log(
    `matcher-capable=${available.length} unavailable=${unavailable.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
