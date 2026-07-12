import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Unavailable } from "@/components/common/Unavailable";
import { fmtUsd } from "@/lib/format";
import {
  resolveLivePortfolioUsd,
  allocationSlices,
  holdingsAllocation,
  portfolioFreshness,
} from "@/lib/portfolio";
import { friendlyMarket } from "@/lib/copy";
import { TokenMark, tokenColor } from "@/lib/tokenIcons";
import { PortfolioBalanceHero } from "@/components/story/PortfolioBalanceHero";
import { InvestmentReceipt } from "@/components/story/InvestmentReceipt";
import { motion } from "framer-motion";
import { ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function ChildPortfolio() {
  const { childId } = useParams();
  const p = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
    refetchInterval: 15_000,
  });
  const tx = useQuery({
    queryKey: ["portfolio-tx", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}/transactions`),
    enabled: !!childId,
  });

  const totalUsd = resolveLivePortfolioUsd(p.data);
  const fresh = portfolioFreshness(p.data);
  const holdings = p.data?.holdings || [];
  const allocFromMap = allocationSlices(p.data?.allocation);
  const allocRaw = allocFromMap.length ? allocFromMap : holdingsAllocation(holdings);
  const alloc = allocRaw.map((a) => ({
    ...a,
    name: friendlyMarket(a.name),
    symbol: a.name,
    value: a.value > 0 && a.value <= 1 ? a.value * 100 : a.value,
  }));
  const sodexError = p.data?.sodexError;
  const warnings: string[] = p.data?.projection?.warnings || p.data?.warnings || [];
  const txs = tx.data?.transactions || p.data?.transactions || [];
  const staking = p.data?.staking;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard
        className="lg:col-span-2"
        title="Family SoDEX spot account"
        subtitle={
          sodexError
            ? "Live SoDEX refresh failed. Snapshot is never shown as live."
            : fresh.live
              ? "Parent-owned · managed by parent · read-only in child view"
              : "Waiting for a live family-account read"
        }
      >
        <PortfolioBalanceHero portfolio={p.data} loading={p.isLoading} />
        <p className="mt-2 text-xs text-white/40">
          Spot trading value only. This is not an allocated balance for {p.data?.child?.displayName || "the child"}.
        </p>
        {warnings.length > 0 && (
          <div className="mt-2 text-xs text-amber-200/75">
            Some family holdings are excluded because no live asset price is available.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Estimated family spot mix">
        {alloc.length === 0 ? (
          <Unavailable
            title="No mix yet"
            detail={
              totalUsd === 0
                ? "Approve a plan trade to add exposure to the family spot account."
                : fresh.waitingPricing || fresh.waitingSsi
                  ? "Waiting for live prices"
                  : "Waiting for priced holdings."
            }
          />
        ) : (
          <>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={alloc} dataKey="value" innerRadius={42} outerRadius={70} stroke="none" paddingAngle={2}>
                    {alloc.map((a, i) => (
                      <Cell key={i} fill={tokenColor(a.symbol)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1.5 text-xs">
              {alloc.map((a) => (
                <div key={a.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <TokenMark symbol={a.symbol} size={18} />
                    {a.name}
                  </span>
                  <span className="font-mono text-white/70">{a.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard
        className="lg:col-span-3"
        title="Family spot holdings"
        subtitle="Balances belong to the parent's shared SoDEX account."
      >
        {holdings.length === 0 ? (
          <Unavailable
            detail={
              fresh.waitingPricing || fresh.waitingSsi || sodexError
                ? "Waiting for live prices"
                : "Nothing invested yet."
            }
          />
        ) : (
          <div className="space-y-2">
            {holdings.map((h: any, i: number) => {
              const sym = h.symbol || h.token || "?";
              const usd = h.usdValue ?? h.valueUsd;
              const unpriced = usd == null || Number.isNaN(Number(usd));
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <TokenMark symbol={sym} size={32} />
                    <div>
                      <div className="text-sm font-medium text-white/90">{friendlyMarket(sym)}</div>
                      <div className="font-mono text-xs text-white/40">
                        {h.qty ?? h.balance ?? h.amount ?? "-"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono text-sm">
                    {unpriced ? (
                      <span className="text-xs text-amber-200/80">Waiting for live prices</span>
                    ) : (
                      fmtUsd(usd)
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        {staking && (
          <p className="mt-3 text-xs text-white/40">
            Base SSI staking is parent-owned, read separately, and excluded from this spot trading value.
          </p>
        )}
      </SectionCard>

      <SectionCard
        className="lg:col-span-3"
        title="Child plan activity"
        subtitle="Orders attributed to this child's plan. Filled assets remain in the parent-owned family account."
      >
        {txs.length === 0 ? (
          <div className="text-sm text-white/50">No orders attributed to this child&apos;s plan yet.</div>
        ) : (
          <div className="relative space-y-0 pl-2">
            {txs.slice(0, 20).map((t: any, i: number) => (
              <div key={t.id || i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < Math.min(txs.length, 20) - 1 && (
                  <span className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-px bg-white/10" />
                )}
                <span className="relative z-[1] mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border border-sky-400/40 bg-sky-400/30" />
                <div className="min-w-0 flex-1">
                  <InvestmentReceipt order={t} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
