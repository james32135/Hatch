import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { fmtUsd } from "@/lib/format";
import { resolvePortfolioUsd } from "@/lib/portfolio";
import { StatusPip } from "@/components/common/StatusPip";

export default function ChildrenList() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const children = me.data?.children || me.data?.user?.children || [];

  const portfolios = useQuery({
    queryKey: ["children-portfolios", children.map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        children.map(async (c: any) => {
          try {
            const p = await api.get<any>(`/api/portfolio/${c.id}`);
            return [c.id, resolvePortfolioUsd(p)] as const;
          } catch {
            return [c.id, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, number | null>;
    },
    enabled: children.length > 0,
  });

  const totals = portfolios.data || {};

  return (
    <div>
      <h1 className="mb-6 text-2xl font-medium tracking-tight">Children</h1>
      <div className="space-y-2">
        {children.map((c: any) => (
          <Link key={c.id} to={`/app/children/${c.id}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]">
            <div>
              <div className="font-medium">{c.displayName}</div>
              <div className="text-xs text-white/50">Age {c.ageYears} · {c.riskTier || "BALANCED"}</div>
            </div>
            <div className="text-right">
              <div className="font-medium">{fmtUsd(totals[c.id] ?? null)}</div>
              {c.paused && <StatusPip tone="warn" label="Paused" className="mt-1" />}
            </div>
          </Link>
        ))}
        {children.length === 0 && <div className="text-sm text-white/50">No children yet.</div>}
      </div>
    </div>
  );
}
