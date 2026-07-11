import { Outlet, Link, NavLink, useNavigate } from "react-router-dom";
import { Bell, Settings as SettingsIcon, LogOut, Users, Layers, LinkIcon, ShieldCheck, Activity as ActivityIcon, Home } from "lucide-react";
import HatchLogo from "@/components/common/HatchLogo";
import { StatusPip } from "@/components/common/StatusPip";
import { useSession } from "@/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AppShell() {
  const { profile, signOut } = useSession();
  const nav = useNavigate();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get("/api/health", { auth: false }),
    refetchInterval: 30_000,
  });
  const backendOk = health.data && (health.data as any).ok !== false;

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`;

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/app" className="text-white"><HatchLogo /></Link>
            <StatusPip tone={backendOk ? "ok" : "danger"} label={`${profile} • backend ${backendOk ? "live" : "unreachable"}`} />
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="text-white/70 hover:text-white" onClick={() => nav("/app/notifications")}><Bell className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-white/70 hover:text-white" onClick={() => nav("/app/settings")}><SettingsIcon className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="text-white/70 hover:text-white" onClick={() => { signOut(); nav("/"); }}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            <NavLink to="/app" end className={linkCls}><Home className="h-4 w-4" /> Dashboard</NavLink>
            <NavLink to="/app/children" className={linkCls}><Users className="h-4 w-4" /> Children</NavLink>
            <NavLink to="/app/activity" className={linkCls}><ActivityIcon className="h-4 w-4" /> Activity</NavLink>
            <div className="mt-4 px-3 text-[10px] uppercase tracking-widest text-white/30">Infra</div>
            <NavLink to="/app/sodex" className={linkCls}><LinkIcon className="h-4 w-4" /> SoDEX</NavLink>
            <NavLink to="/app/valuechain" className={linkCls}><ShieldCheck className="h-4 w-4" /> ValueChain</NavLink>
            <NavLink to="/app/settings" className={linkCls}><Layers className="h-4 w-4" /> Settings</NavLink>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
