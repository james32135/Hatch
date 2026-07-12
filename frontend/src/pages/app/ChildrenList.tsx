import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { fmtUsd } from "@/lib/format";
import { resolveLivePortfolioUsd, portfolioFreshness } from "@/lib/portfolio";
import { StatusPip } from "@/components/common/StatusPip";

export default function ChildrenList() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const children = me.data?.children || me.data?.user?.children || [];

  // Shared parent SoDEX — one live read for the family (never sum per child).
  const family = useQuery({
    queryKey: ["children-family-portfolio", children[0]?.id],
    queryFn: () => api.get<any>(`/api/portfolio/${children[0].id}`),
    enabled: children.length > 0,
    refetchInterval: 15_000,
  });

  const total = resolveLivePortfolioUsd(family.data);
  const fresh = portfolioFreshness(family.data);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-medium tracking-tight">Children</h1>
      {children.length > 0 && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-wider text-white/40">
            Family SoDEX spot account
          </div>
          <div className="mt-1 text-2xl font-medium">
            {total == null ? "—" : fmtUsd(total)}
          </div>
          <p className="mt-1 text-xs text-white/45">
            {fresh.live
              ? "Parent-owned · one shared value shown once · not divided between children"
              : fresh.waitingSsi || family.data?.sodexError
                ? "Waiting for live prices"
                : "Waiting for live balances"}
          </p>
        </div>
      )}
      <div className="space-y-2">
        {children.map((c: any) => (
          <Link
            key={c.id}
            to={`/app/children/${c.id}`}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]"
          >
            <div>
              <div className="font-medium">{c.displayName}</div>
              <div className="text-xs text-white/50">
                Age {c.ageYears} · {c.riskTier || "BALANCED"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/45">Parent-managed plan</div>
              {c.paused && <StatusPip tone="warn" label="Paused" className="mt-1" />}
            </div>
          </Link>
        ))}
        {children.length === 0 && <div className="text-sm text-white/50">No children yet.</div>}
      </div>
    </div>
  );
}
