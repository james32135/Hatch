/** Token / ticker mark colors for portfolio rings. No external image deps. */
const PALETTE: Record<string, string> = {
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#14f195",
  USDC: "#2775ca",
  USDT: "#26a17b",
  WLP: "#38bdf8",
  DEFAULT: "#94a3b8",
};

export function tokenColor(symbol: string | undefined | null): string {
  if (!symbol) return PALETTE.DEFAULT;
  const key = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  return PALETTE[key] || PALETTE[key.slice(0, 3)] || PALETTE.DEFAULT;
}

export function TokenMark({
  symbol,
  size = 28,
}: {
  symbol: string;
  size?: number;
}) {
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  const bg = tokenColor(symbol);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(145deg, ${bg}, color-mix(in srgb, ${bg} 55%, #0a0a0c))`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2)`,
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
