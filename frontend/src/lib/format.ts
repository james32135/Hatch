export function fmtUsd(n: number | string | null | undefined, opts: { fallback?: string; sign?: boolean } = {}) {
  if (n === null || n === undefined || n === "") return opts.fallback ?? "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return opts.fallback ?? "—";
  const s = num.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return opts.sign && num > 0 ? `+${s}` : s;
}

export function fmtPct(n: number | string | null | undefined, opts: { sign?: boolean } = {}) {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  const s = `${num.toFixed(2)}%`;
  return opts.sign && num > 0 ? `+${s}` : s;
}

export function shortAddr(a?: string | null) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function fmtDate(iso?: string | number | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, opts);
}

export function fmtRelative(iso?: string | number | null) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = d - Date.now();
  const abs = Math.abs(diff);
  const s = Math.round(abs / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (s < 60) return rtf.format(Math.round(diff / 1000), "second");
  if (s < 3600) return rtf.format(Math.round(diff / 60000), "minute");
  if (s < 86400) return rtf.format(Math.round(diff / 3600000), "hour");
  return rtf.format(Math.round(diff / 86400000), "day");
}
