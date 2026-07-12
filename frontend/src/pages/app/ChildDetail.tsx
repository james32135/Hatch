import { NavLink, Outlet, useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Pause, Play, RefreshCw, UserSquare2 } from "lucide-react";
import { toast } from "sonner";
import { fmtUsd } from "@/lib/format";
import { resolvePortfolioUsd } from "@/lib/portfolio";
import { StatusPip } from "@/components/common/StatusPip";
import ChildPortfolio from "./ChildPortfolio";

export default function ChildDetail() {
  const { childId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const child = (me.data?.children || me.data?.user?.children || []).find((c: any) => c.id === childId);
  const portfolio = useQuery({ queryKey: ["portfolio", childId], queryFn: () => api.get<any>(`/api/portfolio/${childId}`), enabled: !!childId });

  const togglePause = useMutation({
    mutationFn: () => api.patch<any>(`/api/children/${childId}`, { paused: !child?.paused }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["me"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const snapshot = useMutation({
    mutationFn: () => api.post<any>(`/api/portfolio/${childId}/snapshot`, {}),
    onSuccess: () => { toast.success("Snapshot refreshed"); qc.invalidateQueries({ queryKey: ["portfolio", childId] }); },
    onError: (e: any) => toast.error(e?.message || "Snapshot failed"),
  });
  const openChild = useMutation({
    mutationFn: () => api.post<{ token: string }>("/api/auth/child-token", { childId }),
    onSuccess: (d) => {
      const url = `${window.location.origin}/child#t=${d.token}`;
      navigator.clipboard?.writeText(url);
      toast.success("Child view link copied");
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap border-b-2 px-3 py-2 text-sm ${isActive ? "border-white text-white" : "border-transparent text-white/50 hover:text-white"}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/app/children" className="text-xs text-white/50 hover:text-white">← Children</Link>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">{child?.displayName || "Child"}</h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/50">
            <span>Age {child?.ageYears}</span>
            <span>·</span>
            <span>{child?.riskTier || "BALANCED"}</span>
            {child?.paused && <StatusPip tone="warn" label="Paused" />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-white/50">Portfolio</div>
            <div className="text-xl font-medium">{fmtUsd(resolvePortfolioUsd(portfolio.data))}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => togglePause.mutate()} disabled={togglePause.isPending}>
            {child?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => snapshot.mutate()} disabled={snapshot.isPending}><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => openChild.mutate()}>
            <UserSquare2 className="mr-1.5 h-4 w-4" /> Open child view
          </Button>
        </div>
      </div>

      <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-white/10">
        <NavLink end to={`/app/children/${childId}`} className={tabCls}>Overview</NavLink>
        <NavLink to={`/app/children/${childId}/portfolio`} className={tabCls}>Portfolio</NavLink>
        <NavLink to={`/app/children/${childId}/allowance`} className={tabCls}>Allowance</NavLink>
        <NavLink to={`/app/children/${childId}/lessons`} className={tabCls}>Lessons</NavLink>
        <NavLink to={`/app/children/${childId}/projections`} className={tabCls}>Projections</NavLink>
        <NavLink to={`/app/children/${childId}/ssi`} className={tabCls}>SSI</NavLink>
      </nav>

      <div><ChildPortfolio /></div>
    </div>
  );
}
