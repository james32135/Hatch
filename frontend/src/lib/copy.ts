/** Parent-friendly labels — never invent prices or API data. */

export function friendlyProfile(p: string | null | undefined): string {
  switch (p) {
    case "mainnet":
      return "Live network";
    case "testnet":
      return "Practice network";
    case "mainnet-readonly":
      return "Live · view only";
    default:
      return "Connected";
  }
}

export function friendlyMarket(symbol: string | null | undefined): string {
  if (!symbol) return "Investment";
  const s = String(symbol);
  if (/mag7/i.test(s)) return "MAG7 index";
  if (/ussi/i.test(s)) return "USSI index";
  if (/tsla/i.test(s)) return "Tesla";
  if (/ltc/i.test(s)) return "Litecoin";
  if (/usdc|usdt/i.test(s)) return "Cash (stable)";
  return s.replace(/^v/, "").replace(/_/g, " · ").replace(/\.ssi/i, " index");
}

export function friendlySide(side: string | null | undefined): string {
  const s = String(side || "").toUpperCase();
  if (s === "BUY" || s === "1" || s === "BUY_SIDE") return "Bought";
  if (s === "SELL" || s === "2" || s === "SELL_SIDE") return "Sold";
  return side || "Trade";
}

export function friendlyTxLabel(t: {
  side?: string;
  kind?: string;
  type?: string;
  symbolName?: string;
  symbol?: string;
  market?: string;
}): string {
  const action = friendlySide(t.side || t.kind || t.type);
  const market = friendlyMarket(t.symbolName || t.symbol || t.market);
  return `${action} ${market}`;
}

export function friendlyRisk(tier: string | null | undefined): string {
  switch (String(tier || "").toUpperCase()) {
    case "CONSERVATIVE":
      return "Steady";
    case "BALANCED":
      return "Balanced";
    case "GROWTH":
      return "Growth";
    default:
      return tier || "Balanced";
  }
}

export function friendlyReadiness(nextStep: string | null | undefined): {
  label: string;
  tone: "ok" | "warn" | "danger" | "info";
} {
  switch (nextStep) {
    case "READY":
      return { label: "Ready to invest", tone: "ok" };
    case "ENABLE_TRADING":
      return { label: "Enable trading to continue", tone: "warn" };
    case "CONNECT_WALLET":
      return { label: "Connect your wallet", tone: "warn" };
    case "FUND_ACCOUNT":
      return { label: "Add funds to get started", tone: "warn" };
    default:
      return { label: nextStep ? String(nextStep).replace(/_/g, " ") : "Checking…", tone: "info" };
  }
}

/** Improve generic lesson titles using body text when the API returns placeholders. */
export function friendlyLessonTitle(lesson: {
  title?: string;
  kind?: string;
  body?: string;
}): string {
  const raw = (lesson.title || "").trim();
  const generic =
    !raw ||
    /^your portfolio/i.test(raw) ||
    raw === lesson.kind ||
    /^portfolio_delta$/i.test(raw);

  if (!generic) return raw;

  const body = (lesson.body || "").trim();
  if (body) {
    const first = body.split(/[.!?\n]/).map((s) => s.trim()).find((s) => s.length > 12);
    if (first) {
      const clipped = first.length > 72 ? `${first.slice(0, 69)}…` : first;
      return clipped;
    }
  }

  switch (lesson.kind) {
    case "portfolio_delta":
      return "What changed in the family account";
    case "weekly_digest":
      return "This week's investing story";
    default:
      return "A short lesson from family-account activity";
  }
}

export function friendlyLessonStatus(status: string | null | undefined): string {
  switch (String(status || "").toUpperCase()) {
    case "READY":
      return "Ready";
    case "PENDING":
    case "QUEUED":
      return "Writing…";
    case "FAILED":
      return "Couldn't generate";
    default:
      return status || "—";
  }
}
