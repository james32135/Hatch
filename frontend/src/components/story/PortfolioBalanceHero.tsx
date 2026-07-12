import {
  portfolioFreshness,
  portfolioWaitingCopy,
  resolveLivePortfolioUsd,
  resolveSnapshotPortfolioUsd,
} from "@/lib/portfolio";
import { fmtUsd, fmtDate } from "@/lib/format";
import { Unavailable } from "@/components/common/Unavailable";
import { motion } from "framer-motion";

/** Single source of truth display — never invents balances. */
export function PortfolioBalanceHero({
  portfolio,
  loading,
  className = "text-5xl font-medium tracking-tight",
}: {
  portfolio: any;
  loading?: boolean;
  className?: string;
}) {
  if (loading) return <div className="h-14 animate-pulse rounded-xl bg-white/5" />;

  const live = resolveLivePortfolioUsd(portfolio);
  const snap = resolveSnapshotPortfolioUsd(portfolio);
  const fresh = portfolioFreshness(portfolio);
  const wait = portfolioWaitingCopy(portfolio);
  const partialUnpriced =
    fresh.waitingPricing ||
    (Array.isArray(portfolio?.warnings) &&
      portfolio.warnings.some((w: string) => /no live usd price/i.test(String(w))));

  if (live != null) {
    return (
      <div>
        <motion.div
          key={String(live)}
          initial={{ opacity: 0.4, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 140, damping: 18 }}
          className={className}
        >
          {fmtUsd(live)}
        </motion.div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Family SoDEX spot account
          </span>
          {portfolio?.valuation?.method === "sodex_asset_price" && (
            <span>· Official SoDEX asset prices</span>
          )}
          {fresh.pricedAt && <span>Priced {fmtDate(fresh.pricedAt)}</span>}
          {fresh.sharedAccount && <span>· Managed by parent</span>}
        </div>
        {partialUnpriced && (
          <p className="mt-2 text-xs text-amber-200/80">
            Some family holdings are not priced yet — the spot value excludes them.
          </p>
        )}
      </div>
    );
  }

  if (snap != null) {
    return (
      <div>
        <div className={`${className} text-white/70`}>{fmtUsd(snap)}</div>
        <p className="mt-2 text-sm text-amber-200/85">Last known value · not live</p>
        {fresh.snapshotAt && (
          <p className="mt-0.5 text-xs text-white/40">Snapshot {fmtDate(fresh.snapshotAt)}</p>
        )}
        <p className="mt-2 text-xs text-white/50">{wait.detail}</p>
      </div>
    );
  }

  return <Unavailable title={wait.title} detail={wait.detail} />;
}
