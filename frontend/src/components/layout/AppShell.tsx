import { Outlet, Link, NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  Settings as SettingsIcon,
  LogOut,
  Users,
  LinkIcon,
  ShieldCheck,
  Activity as ActivityIcon,
  Home,
  BookOpen,
  Eye,
  Sparkles,
} from "lucide-react";
import HatchLogo from "@/components/common/HatchLogo";
import { StatusPip } from "@/components/common/StatusPip";
import { WalkthroughGuide } from "@/components/story/WalkthroughGuide";
import { useSession } from "@/hooks/useSession";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { friendlyProfile } from "@/lib/copy";

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
    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition ${
      isActive ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white"
    }`;

  return (
    <div className="min-h-[100dvh] bg-[#050507] text-white">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 10% -10%, rgba(56, 189, 248, 0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 90% 0%, rgba(52, 211, 153, 0.08), transparent 50%)",
        }}
      />
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#050507]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 md:px-6">
          <div className="flex items-center gap-4 md:gap-6">
            <Link to="/app" className="text-white">
              <HatchLogo />
            </Link>
            <StatusPip
              tone={backendOk ? "ok" : "danger"}
              label={backendOk ? friendlyProfile(profile) : "Connection issue"}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <Button size="sm" variant="ghost" className="text-white/60 hover:text-white" onClick={() => nav("/app/notifications")} aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-white/60 hover:text-white" onClick={() => nav("/app/settings")} aria-label="Settings">
              <SettingsIcon className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/60 hover:text-white"
              onClick={() => {
                signOut();
                nav("/");
              }}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex max-w-7xl gap-8 px-5 py-6 md:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-20 flex flex-col gap-0.5">
            <NavLink to="/app" end className={linkCls}>
              <Home className="h-4 w-4" strokeWidth={1.5} /> Home
            </NavLink>
            <NavLink to="/app/children" className={linkCls}>
              <Users className="h-4 w-4" strokeWidth={1.5} /> Children
            </NavLink>
            <NavLink to="/app/activity" className={linkCls}>
              <ActivityIcon className="h-4 w-4" strokeWidth={1.5} /> Activity
            </NavLink>
            <NavLink to="/app/agent" className={linkCls}>
              <Sparkles className="h-4 w-4" strokeWidth={1.5} /> Agent
            </NavLink>

            <div className="mt-6 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">More</div>
            <NavLink to="/app/sodex" className={linkCls}>
              <LinkIcon className="h-4 w-4" strokeWidth={1.5} /> Trading
            </NavLink>
            <NavLink to="/app/valuechain" className={linkCls}>
              <ShieldCheck className="h-4 w-4" strokeWidth={1.5} /> Security
            </NavLink>
            <NavLink to="/app/transparency" className={linkCls}>
              <Eye className="h-4 w-4" strokeWidth={1.5} /> Transparency
            </NavLink>
            <NavLink to="/app/settings" className={linkCls}>
              <BookOpen className="h-4 w-4" strokeWidth={1.5} /> Settings
            </NavLink>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-16">
          <Outlet />
        </main>
      </div>

      <WalkthroughGuide />

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/[0.06] bg-[#050507]/95 backdrop-blur-xl md:hidden">
        {[
          { to: "/app", label: "Home", end: true, Icon: Home },
          { to: "/app/children", label: "Children", Icon: Users },
          { to: "/app/activity", label: "Activity", Icon: ActivityIcon },
          { to: "/app/settings", label: "Settings", Icon: SettingsIcon },
        ].map(({ to, label, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-3 text-[10px] ${isActive ? "text-white" : "text-white/40"}`
            }
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
