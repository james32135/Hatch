import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Pause, Play, RefreshCw, UserSquare2 } from "lucide-react";
import { toast } from "sonner";
import { fmtUsd } from "@/lib/format";
import { resolveLivePortfolioUsd, portfolioFreshness } from "@/lib/portfolio";
import { friendlyRisk } from "@/lib/copy";
import { StatusPip } from "@/components/common/StatusPip";

export default function ChildDetail() {
  const { childId } = useParams();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const child = (me.data?.children || me.data?.user?.children || []).find((c: any) => c.id === childId);
  const portfolio = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
    refetchInterval: 15_000,
  });

  const togglePause = useMutation({
    mutationFn: () => api.patch<any>(`/api/children/${childId}`, { paused: !child?.paused }),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't update"),
  });
  const snapshot = useMutation({
    mutationFn: () => api.post<any>(`/api/portfolio/${childId}/snapshot`, {}),
    onSuccess: () => {
      toast.success("Portfolio refreshed");
      qc.invalidateQueries({ queryKey: ["portfolio", childId] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't refresh"),
  });
  const openChild = useMutation({
    mutationFn: () => api.post<{ token: string }>("/api/auth/child-token", { childId }),
    onSuccess: (d) => {
      const url = `${window.location.origin}/child#t=${d.token}`;
      navigator.clipboard?.writeText(url);
      toast.success("Child view link copied");
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't create link"),
  });

  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${isActive ? "border-white text-white" : "border-transparent text-white/45 hover:text-white"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/app/children" className="text-xs text-white/45 hover:text-white">
            ← Children
          </Link>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">{child?.displayName || "Child"}</h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
            <span>Age {child?.ageYears}</span>
            <span>·</span>
            <span>{friendlyRisk(child?.riskTier)}</span>
            {child?.paused && <StatusPip tone="warn" label="Paused" />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-white/45">Portfolio</div>
            <div className="text-xl font-medium">
              {(() => {
                const live = resolveLivePortfolioUsd(portfolio.data);
                const fresh = portfolioFreshness(portfolio.data);
                if (live != null) return fmtUsd(live);
                if (fresh.waitingSsi || portfolio.data?.sodexError) return "Waiting…";
                return "-";
              })()}
            </div>
            <div className="text-[10px] text-white/35">
              {portfolioFreshness(portfolio.data).live ? "Live SoDEX" : "Not live"}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => togglePause.mutate()} disabled={togglePause.isPending} aria-label="Pause or resume">
            {child?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => snapshot.mutate()} disabled={snapshot.isPending} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => openChild.mutate()}>
            <UserSquare2 className="mr-1.5 h-4 w-4" /> Child view
          </Button>
        </div>
      </div>

      <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-white/10">
        <NavLink end to={`/app/children/${childId}`} className={tabCls}>
          Overview
        </NavLink>
        <NavLink to={`/app/children/${childId}/portfolio`} className={tabCls}>
          Portfolio
        </NavLink>
        <NavLink to={`/app/children/${childId}/allowance`} className={tabCls}>
          Allowance
        </NavLink>
        <NavLink to={`/app/children/${childId}/lessons`} className={tabCls}>
          Lessons
        </NavLink>
        <NavLink to={`/app/children/${childId}/projections`} className={tabCls}>
          Future
        </NavLink>
        <NavLink to={`/app/children/${childId}/ssi`} className={tabCls}>
          Invest
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
