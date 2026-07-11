import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { Unavailable } from "@/components/common/Unavailable";
import { fmtUsd, fmtRelative } from "@/lib/format";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, TrendingUp, Sparkles, Users } from "lucide-react";
import { motion } from "framer-motion";

export default function Dashboard() {
  const nav = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const allowances = useQuery({ queryKey: ["allowances"], queryFn: () => api.get<any>("/api/allowances") });
  const handoffs = useQuery({ queryKey: ["allowances", "handoffs"], queryFn: () => api.get<any>("/api/allowances/handoffs") });
  const sodex = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const caps = useQuery({ queryKey: ["ssi-caps"], queryFn: () => api.get<any>("/api/ssi/capabilities", { auth: false }) });
  const vc = useQuery({ queryKey: ["vc-main"], queryFn: () => api.get<any>("/api/valuechain/contracts?network=mainnet", { auth: false }) });

  const children = me.data?.children || me.data?.user?.children || [];

  // Live portfolio totals per child (auth/me does not embed snapshots)
  const portfolios = useQuery({
    queryKey: ["dashboard-portfolios", children.map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        children.map(async (c: any) => {
          try {
            const p = await api.get<any>(`/api/portfolio/${c.id}`);
            const total =
              p?.performance?.totalUsd ??
              p?.projection?.totalUsd ??
              p?.latestSnapshot?.totalUsd ??
              null;
            return [c.id, total] as const;
          } catch {
            return [c.id, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, number | null>;
    },
    enabled: children.length > 0,
  });

  if (me.isLoading) return <div className="text-sm text-white/50">Loading…</div>;

  if (children.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-12 text-center"
      >
        <motion.div
          aria-hidden
          className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(199 89% 60% / 0.2), transparent)" }}
          animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 6, repeat: Infinity }}
        />
        <div className="relative">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-white/70" />
          <h2 className="text-2xl font-medium tracking-tight md:text-3xl">Add your first child to begin their first portfolio.</h2>
          <p className="mt-2 text-sm text-white/60">Onboarding takes about a minute.</p>
          <Button className="mt-6 bg-white text-black hover:bg-white/90" onClick={() => nav("/app/onboarding")}>
            <Plus className="mr-1.5 h-4 w-4" /> Start onboarding
          </Button>
        </div>
      </motion.div>
    );
  }

  const pendingHandoffs = (handoffs.data?.handoffs || []).length;
  const totals = portfolios.data || {};
  const known = Object.values(totals).filter((v) => v != null && !Number.isNaN(Number(v))) as number[];
  const totalUsd = known.length ? known.reduce((s, n) => s + Number(n), 0) : null;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between"
      >
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Overview</div>
          <h1 className="mt-1 text-3xl font-medium tracking-tight">Dashboard</h1>
        </div>
        <Button size="sm" className="bg-white text-black hover:bg-white/90" asChild><Link to="/app/onboarding"><Plus className="mr-1.5 h-4 w-4" /> Add child</Link></Button>
      </motion.div>

      {/* Summary strip */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 md:grid-cols-3">
        <StatTile label="Total portfolio" value={totalUsd == null ? "Unavailable" : fmtUsd(totalUsd)} icon={TrendingUp} tone="hsl(142 71% 45%)" />
        <StatTile label="Children" value={String(children.length)} icon={Users} tone="hsl(199 89% 60%)" />
        <StatTile label="Pending signatures" value={String(pendingHandoffs)} icon={Sparkles} tone={pendingHandoffs ? "hsl(38 92% 55%)" : "hsl(0 0% 60%)"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {children.map((c: any, i: number) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
          >
            <Link
              to={`/app/children/${c.id}`}
              className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/[0.03] blur-2xl transition-opacity group-hover:bg-white/[0.06]" />
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="text-lg font-medium">{c.displayName}</div>
                  <div className="text-xs text-white/50">Age {c.ageYears} · {c.riskTier || "BALANCED"}</div>
                </div>
                {c.paused && <StatusPip tone="warn" label="Paused" />}
              </div>
              <div className="relative mt-6 text-3xl font-medium tracking-tight">
                {totals[c.id] == null ? "Unavailable" : fmtUsd(totals[c.id])}
              </div>
              <div className="relative mt-1 text-xs text-white/50">Latest snapshot</div>
              <svg viewBox="0 0 300 40" className="relative mt-4 h-10 w-full">
                <motion.path
                  d={i % 2 === 0 ? "M 0 30 L 50 26 L 100 28 L 150 18 L 200 22 L 250 12 L 300 8" : "M 0 22 L 50 28 L 100 20 L 150 24 L 200 14 L 250 18 L 300 10"}
                  stroke="hsl(199 89% 60%)" strokeWidth="1.5" fill="none"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.2 + i * 0.06 }}
                />
              </svg>
              <div className="relative mt-4 flex items-center gap-2 text-xs text-white/50 group-hover:text-white">
                Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Weekly allowance" action={<Link to="/app/notifications" className="text-xs text-white/50 hover:text-white">Notifications</Link>}>
          {allowances.isError ? <Unavailable /> : (
            <div className="space-y-2 text-sm">
              {(allowances.data?.policies || []).length === 0 && <div className="text-white/50">No policies yet.</div>}
              {(allowances.data?.policies || []).slice(0, 3).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div>
                    <div className="font-medium">{fmtUsd(p.amountUsd)} <span className="text-white/50">every {p.cadenceDays}d</span></div>
                    <div className="text-xs text-white/50">Next {fmtRelative(p.nextDueAt)}</div>
                  </div>
                  <StatusPip tone={p.paused ? "warn" : "ok"} label={p.paused ? "Paused" : "Active"} />
                </div>
              ))}
              {pendingHandoffs > 0 && (
                <div className="mt-2 rounded-lg border border-[hsl(38_92%_55%/0.3)] bg-[hsl(38_92%_55%/0.06)] px-3 py-2 text-xs text-[hsl(38_92%_75%)]">
                  {pendingHandoffs} allowance {pendingHandoffs === 1 ? "needs" : "need"} your signature.
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Infrastructure">
          <div className="space-y-2 text-sm">
            <Row label="SoDEX" tone={sodex.data?.nextStep === "READY" ? "ok" : "warn"} value={sodex.data?.nextStep || "—"} />
            <Row label="SSI Path A (SoDEX Vault)" tone={caps.data?.pathA_sodexVault?.mint ? "ok" : "warn"} value={caps.data?.pathA_sodexVault?.mint ? "Available" : "Unavailable"} />
            <Row label="SSI Path B (Base mint)" tone={caps.data?.pathB_baseMint?.available ? "ok" : "warn"} value={caps.data?.pathB_baseMint?.available ? "Available" : "Blocked"} />
            <Row label="ValueChain audit" tone={vc.data?.ok ? "ok" : "warn"} value={vc.data?.ok ? "Verified" : "—"} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden bg-black p-5"
    >
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl" style={{ background: tone, opacity: 0.15 }} />
      <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="relative mt-2 text-2xl font-medium tracking-tight">{value}</div>
    </motion.div>
  );
}

function Row({ label, tone, value }: { label: string; tone: "ok" | "warn" | "danger"; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <span className="text-white/70">{label}</span>
      <StatusPip tone={tone} label={value} />
    </div>
  );
}
