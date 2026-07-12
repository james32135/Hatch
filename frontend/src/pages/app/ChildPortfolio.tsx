import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Unavailable } from "@/components/common/Unavailable";
import { fmtUsd, fmtDate, fmtPct } from "@/lib/format";
import { resolvePortfolioUsd, allocationSlices, holdingsAllocation } from "@/lib/portfolio";
import { friendlyMarket, friendlyTxLabel } from "@/lib/copy";
import { TokenMark, tokenColor } from "@/lib/tokenIcons";
import { motion } from "framer-motion";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";

export default function ChildPortfolio() {
  const { childId } = useParams();
  const p = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
  });
  const hist = useQuery({
    queryKey: ["portfolio-hist", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}/history?limit=60`),
    enabled: !!childId,
  });
  const tx = useQuery({
    queryKey: ["portfolio-tx", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}/transactions`),
    enabled: !!childId,
  });

  const totalUsd = resolvePortfolioUsd(p.data);
  const holdings = p.data?.holdings || [];
  const allocFromMap = allocationSlices(p.data?.allocation);
  const allocRaw = allocFromMap.length ? allocFromMap : holdingsAllocation(holdings);
  const alloc = allocRaw.map((a) => ({
    ...a,
    name: friendlyMarket(a.name),
    symbol: a.name,
    value: a.value > 0 && a.value <= 1 ? a.value * 100 : a.value,
  }));
  const series = (hist.data?.history || hist.data || []).map((h: any) => ({
    t: h.at || h.timestamp,
    v: Number(h.totalUsd ?? h.value ?? 0),
  }));
  const sodexError = p.data?.sodexError;
  const warnings: string[] = p.data?.projection?.warnings || p.data?.warnings || [];
  const txs = tx.data?.transactions || p.data?.transactions || [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard
        className="lg:col-span-2"
        title="Growing with them"
        subtitle={sodexError ? "Couldn't refresh live prices. Showing the last known value." : "Live portfolio from SoDEX."}
      >
        {p.isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-white/5" />
        ) : totalUsd == null ? (
          <Unavailable />
        ) : (
          <>
            <motion.div
              key={String(totalUsd)}
              initial={{ opacity: 0.4, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 140, damping: 18 }}
              className="text-5xl font-medium tracking-tight"
            >
              {fmtUsd(totalUsd)}
            </motion.div>
            {p.data?.performance?.pnlPct != null && (
              <div
                className={`mt-1 text-sm ${Number(p.data.performance.pnlPct) >= 0 ? "text-[hsl(142_71%_55%)]" : "text-[hsl(350_89%_65%)]"}`}
              >
                {fmtPct(p.data.performance.pnlPct, { sign: true })} since they started
              </div>
            )}
            {warnings.length > 0 && (
              <div className="mt-2 text-xs text-white/40">{warnings.slice(0, 2).join(" · ")}</div>
            )}
            <div className="mt-6 h-40">
              {series.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="v" stroke="#7dd3fc" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs text-white/40">History appears after their first investment.</div>
              )}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Mix">
        {alloc.length === 0 ? (
          <Unavailable
            title="No mix yet"
            detail={totalUsd === 0 ? "Invest from Allowance to build their first allocation." : "Waiting for priced holdings."}
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

      <SectionCard className="lg:col-span-3" title="Holdings">
        {holdings.length === 0 ? (
          <Unavailable detail="Nothing invested yet." />
        ) : (
          <div className="space-y-2">
            {holdings.map((h: any, i: number) => {
              const sym = h.symbol || h.token || "?";
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
                  <div className="text-right font-mono text-sm">{fmtUsd(h.usdValue ?? h.valueUsd)}</div>
                </motion.div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard className="lg:col-span-3" title="Investment timeline">
        {txs.length === 0 ? (
          <div className="text-sm text-white/50">No investments yet.</div>
        ) : (
          <div className="relative space-y-0 pl-2">
            {txs.slice(0, 12).map((t: any, i: number) => (
              <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < Math.min(txs.length, 12) - 1 && (
                  <span className="absolute left-[7px] top-4 h-[calc(100%-4px)] w-px bg-white/10" />
                )}
                <span className="relative z-[1] mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border border-sky-400/40 bg-sky-400/30" />
                <div className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm">
                  <div className="text-white/85">{friendlyTxLabel(t)}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-white/70">
                      {fmtUsd(t.notionalUsd ?? t.amountUsd ?? t.quantity)}
                    </span>
                    <span className="text-white/40">{fmtDate(t.at || t.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
