import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Unavailable } from "@/components/common/Unavailable";
import { fmtUsd, fmtDate, fmtPct } from "@/lib/format";
import { resolvePortfolioUsd, allocationSlices, holdingsAllocation } from "@/lib/portfolio";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#ffffff", "#a1a1aa", "#71717a", "#52525b"];

export default function ChildPortfolio() {
  const { childId } = useParams();
  const p = useQuery({ queryKey: ["portfolio", childId], queryFn: () => api.get<any>(`/api/portfolio/${childId}`), enabled: !!childId });
  const hist = useQuery({ queryKey: ["portfolio-hist", childId], queryFn: () => api.get<any>(`/api/portfolio/${childId}/history?limit=60`), enabled: !!childId });
  const tx = useQuery({ queryKey: ["portfolio-tx", childId], queryFn: () => api.get<any>(`/api/portfolio/${childId}/transactions`), enabled: !!childId });

  const totalUsd = resolvePortfolioUsd(p.data);
  const holdings = p.data?.holdings || [];
  const allocFromMap = allocationSlices(p.data?.allocation);
  // allocation map stores fractions 0–1 or percents — backend uses 0–100 pcts; normalize display
  const allocRaw = allocFromMap.length
    ? allocFromMap
    : holdingsAllocation(holdings);
  // Backend allocation is already percent (mag7Pct etc). Holdings allocationPct is also percent.
  // Pie needs relative weights; display as percent. If values look like 0–1 fractions, scale.
  const alloc = allocRaw.map((a) => ({
    ...a,
    value: a.value > 0 && a.value <= 1 ? a.value * 100 : a.value,
  }));
  const series = (hist.data?.history || hist.data || []).map((h: any) => ({ t: h.at || h.timestamp, v: Number(h.totalUsd ?? h.value ?? 0) }));
  const sodexError = p.data?.sodexError;
  const warnings: string[] = p.data?.projection?.warnings || p.data?.warnings || [];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SectionCard className="lg:col-span-2" title="Value" subtitle={sodexError ? "SoDEX returned an error — showing last known value" : undefined}>
        {p.isLoading ? <div className="text-sm text-white/50">Loading…</div> : totalUsd == null ? <Unavailable /> : (
          <>
            <div className="text-5xl font-medium tracking-tight">{fmtUsd(totalUsd)}</div>
            {p.data?.performance?.pnlPct != null && (
              <div className={`mt-1 text-sm ${Number(p.data.performance.pnlPct) >= 0 ? "text-[hsl(142_71%_55%)]" : "text-[hsl(350_89%_65%)]"}`}>
                {fmtPct(p.data.performance.pnlPct, { sign: true })} vs cost basis
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
                    <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
                    <Line type="monotone" dataKey="v" stroke="white" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="text-xs text-white/40">No history yet.</div>}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard title="Allocation">
        {alloc.length === 0 ? (
          <Unavailable title="No allocation yet" detail={totalUsd === 0 ? "Portfolio is empty — invest via Allowance." : "Waiting for priced holdings."} />
        ) : (
          <>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={alloc} dataKey="value" innerRadius={40} outerRadius={70} stroke="none">
                    {alloc.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1 text-xs">
              {alloc.map((a, i) => (
                <div key={a.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded" style={{ background: COLORS[i % COLORS.length] }} />{a.name}</span>
                  <span className="font-mono text-white/70">{a.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard className="lg:col-span-3" title="Holdings">
        {holdings.length === 0 ? <Unavailable detail="No holdings yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-white/40"><tr><th className="pb-2 text-left font-normal">Token</th><th className="pb-2 text-right font-normal">Balance</th><th className="pb-2 text-right font-normal">USD</th></tr></thead>
              <tbody>
                {holdings.map((h: any, i: number) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2 font-mono">{h.symbol || h.token}</td>
                    <td className="py-2 text-right font-mono">{h.qty ?? h.balance ?? h.amount ?? "—"}</td>
                    <td className="py-2 text-right font-mono">{fmtUsd(h.usdValue ?? h.valueUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard className="lg:col-span-3" title="Transactions">
        {(tx.data?.transactions || p.data?.transactions || []).length === 0 ? <div className="text-sm text-white/50">No transactions yet.</div> : (
          <div className="space-y-1">
            {(tx.data?.transactions || p.data?.transactions || []).slice(0, 10).map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                <div><span className="font-mono">{t.side || t.kind || t.type}</span> <span className="text-white/40">{t.symbolName || t.symbol || t.market || ""}</span></div>
                <div className="flex items-center gap-3"><span className="font-mono text-white/70">{fmtUsd(t.notionalUsd ?? t.amountUsd ?? t.quantity)}</span><span className="text-white/40">{fmtDate(t.at || t.createdAt)}</span></div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
