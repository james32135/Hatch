import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtUsd } from "@/lib/format";
import {
  resolveLivePortfolioUsd,
  allocationSlices,
  holdingsAllocation,
  portfolioFreshness,
} from "@/lib/portfolio";
import { PortfolioBalanceHero } from "@/components/story/PortfolioBalanceHero";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Unavailable } from "@/components/common/Unavailable";

const COLORS = ["#ffffff", "#a1a1aa", "#71717a", "#52525b"];

export default function ChildKidPortfolio() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const childId = me.data?.childId || me.data?.scopes?.childId;
  const p = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
    refetchInterval: 20_000,
  });

  const holdings = p.data?.holdings || [];
  const allocRaw = allocationSlices(p.data?.allocation).length
    ? allocationSlices(p.data?.allocation)
    : holdingsAllocation(holdings);
  const alloc = allocRaw.map((a) => ({
    ...a,
    value: a.value > 0 && a.value <= 1 ? a.value * 100 : a.value,
  }));
  const total = resolveLivePortfolioUsd(p.data);
  const fresh = portfolioFreshness(p.data);

  if (!p.isLoading && total == null && fresh.source === "unavailable") {
    return (
      <Unavailable
        title="Waiting for SSI confirmation"
        detail="Your portfolio will appear from your parent's live SoDEX account after the first investment."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-white/40">Total</div>
        <div className="mt-2">
          <PortfolioBalanceHero
            portfolio={p.data}
            loading={p.isLoading}
            className="text-5xl font-medium tracking-tight"
          />
        </div>
        <p className="mt-2 text-xs text-white/40">Read-only · parent SoDEX balances</p>
      </div>

      {alloc.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-3 text-sm text-white/60">What you own</div>
          <div className="h-40">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={alloc} dataKey="value" innerRadius={40} outerRadius={70} stroke="none">
                  {alloc.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {alloc.map((a, i) => (
              <div key={a.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded" style={{ background: COLORS[i % COLORS.length] }} />
                  {a.name}
                </span>
                <span className="font-mono text-white/70">{a.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {holdings.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="mb-3 text-sm text-white/60">Details</div>
          <div className="space-y-2 text-sm">
            {holdings.map((h: any, i: number) => {
              const usd = h.usdValue ?? h.valueUsd;
              const unpriced = usd == null || Number.isNaN(Number(usd));
              return (
                <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-none">
                  <span className="font-mono">{h.symbol || h.token}</span>
                  <span className="font-mono text-white/70">
                    {unpriced ? "Waiting for SSI confirmation" : fmtUsd(usd)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
