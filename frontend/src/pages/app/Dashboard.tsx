import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { EmptyState } from "@/components/common/EmptyState";
import { InfraStatus, useInfraLive } from "@/components/story/InfraStatus";
import { ProductFlowSvg } from "@/components/story/ProductFlowSvg";
import { StoryPipeline, derivePipeline } from "@/components/story/StoryPipeline";
import { fmtUsd, fmtRelative } from "@/lib/format";
import { friendlyRisk, friendlyReadiness, friendlyLessonTitle } from "@/lib/copy";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, TrendingUp, Sparkles, Users, BookOpen, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo } from "react";

export default function Dashboard() {
  const nav = useNavigate();
  const live = useInfraLive();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const allowances = useQuery({ queryKey: ["allowances"], queryFn: () => api.get<any>("/api/allowances") });
  const handoffs = useQuery({ queryKey: ["allowances", "handoffs"], queryFn: () => api.get<any>("/api/allowances/handoffs") });
  const sodex = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const ordersQ = useQuery({
    queryKey: ["diag-orders"],
    queryFn: () => api.get<any>("/api/diag/orders"),
  });

  const children = me.data?.children || me.data?.user?.children || [];

  const portfolios = useQuery({
    queryKey: ["dashboard-portfolios", children.map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        children.map(async (c: any) => {
          try {
            const p = await api.get<any>(`/api/portfolio/${c.id}`);
            const total =
              p?.performance?.currentUsd ??
              p?.projection?.totalUsd ??
              p?.totalUsd ??
              p?.latestSnapshot?.totalUsd ??
              null;
            const pnl = p?.performance?.pnlUsd ?? null;
            const holdings = p?.holdings || [];
            const txs = p?.transactions || [];
            return [c.id, { total, pnl, hasAssets: holdings.length > 0 || txs.length > 0 }] as const;
          } catch {
            return [c.id, { total: null, pnl: null, hasAssets: false }] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<
        string,
        { total: number | null; pnl: number | null; hasAssets: boolean }
      >;
    },
    enabled: children.length > 0,
  });

  const lessonsPreview = useQuery({
    queryKey: ["dash-lessons", children[0]?.id],
    queryFn: () => api.get<any>(`/api/lessons/${children[0].id}`),
    enabled: !!children[0]?.id,
  });

  const pendingHandoffsEarly = (handoffs.data?.handoffs || []).length;
  const policiesEarly = allowances.data?.policies || [];
  const totalsEarly = portfolios.data || {};
  const hasAssetsEarly = Object.values(totalsEarly).some(
    (v) => v.hasAssets || (v.total != null && Number(v.total) > 0),
  );
  const latestLessonEarly = (lessonsPreview.data?.lessons || lessonsPreview.data || [])[0];
  const ordersList = ordersQ.data?.orders || ordersQ.data || [];
  const hasRelayEarly = Array.isArray(ordersList) && ordersList.length > 0;
  const orderEvEarly = Array.isArray(ordersList) ? ordersList[0] : null;

  const pipelineSteps = useMemo(
    () =>
      derivePipeline({
        hasPolicy: policiesEarly.length > 0,
        policyPaused: policiesEarly.length > 0 && policiesEarly.every((p: any) => p.paused),
        pendingHandoff: pendingHandoffsEarly > 0,
        hasRelay: hasRelayEarly,
        orderStatus: orderEvEarly?.status || orderEvEarly?.state,
        hasHoldingsOrTx: hasAssetsEarly,
        hasLesson: !!latestLessonEarly,
        valuechainOk: live.valuechainOk,
      }),
    [
      policiesEarly,
      pendingHandoffsEarly,
      hasRelayEarly,
      orderEvEarly,
      hasAssetsEarly,
      latestLessonEarly,
      live.valuechainOk,
    ],
  );

  if (me.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-white/5" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/[0.08] via-white/[0.02] to-emerald-500/[0.06] p-10 text-center md:p-14">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-sky-300/80" strokeWidth={1.5} />
          <h2 className="text-2xl font-medium tracking-tight md:text-3xl">
            Instead of weekly spending money,
            <br className="hidden sm:block" /> build their future automatically.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/60">
            Add your child, set a weekly allowance, and HATCH invests it for them while they learn how money grows.
          </p>
          <Button className="mt-8 bg-white text-black hover:bg-white/90" onClick={() => nav("/app/onboarding")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add your first child
          </Button>
        </div>
        <ProductFlowSvg />
        <InfraStatus />
      </motion.div>
    );
  }

  const pendingHandoffs = (handoffs.data?.handoffs || []).length;
  const totals = portfolios.data || {};
  const known = Object.values(totals)
    .map((v) => v.total)
    .filter((v) => v != null && !Number.isNaN(Number(v))) as number[];
  const totalUsd = known.length ? known.reduce((s, n) => s + Number(n), 0) : null;
  const policies = allowances.data?.policies || [];
  const nextPolicy = policies
    .filter((p: any) => !p.paused && p.nextDueAt)
    .sort((a: any, b: any) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime())[0];
  const latestLesson = (lessonsPreview.data?.lessons || lessonsPreview.data || [])[0];
  const ready = friendlyReadiness(sodex.data?.nextStep);

  let suggested: { label: string; to: string } | null = null;
  if (pendingHandoffs > 0 && children[0]) {
    suggested = { label: "Approve this week's investment", to: `/app/children/${children[0].id}/allowance` };
  } else if (sodex.data && sodex.data.nextStep !== "READY") {
    suggested = { label: "Finish trading setup", to: "/app/sodex" };
  } else if (children[0]) {
    suggested = { label: `Open ${children[0].displayName}'s portfolio`, to: `/app/children/${children[0].id}` };
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <p className="text-sm text-white/50">Parents are not buying crypto. You are building their future.</p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight">Home</h1>
        </div>
        <Button size="sm" className="bg-white text-black hover:bg-white/90" asChild>
          <Link to="/app/onboarding">
            <Plus className="mr-1.5 h-4 w-4" /> Add child
          </Link>
        </Button>
      </motion.div>

      <ProductFlowSvg />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OutcomeTile
          label="Invested so far"
          value={totalUsd == null ? "-" : fmtUsd(totalUsd)}
          hint={totalUsd === 0 ? "Waiting for first investment" : "Across all children"}
          icon={TrendingUp}
        />
        <OutcomeTile label="Children" value={String(children.length)} hint="Growing with you" icon={Users} />
        <OutcomeTile
          label="Next allowance"
          value={nextPolicy ? fmtRelative(nextPolicy.nextDueAt) : "-"}
          hint={nextPolicy ? fmtUsd(nextPolicy.amountUsd) : "Set a weekly plan"}
          icon={Calendar}
        />
        <OutcomeTile
          label="Needs your OK"
          value={String(pendingHandoffs)}
          hint={pendingHandoffs ? "Sign to invest this week" : "You're all caught up"}
          icon={Sparkles}
          highlight={pendingHandoffs > 0}
        />
      </div>

      {suggested && (
        <Link
          to={suggested.to}
          className="flex items-center justify-between gap-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] px-5 py-4 transition hover:bg-sky-400/[0.1]"
        >
          <div>
            <div className="text-xs uppercase tracking-wider text-sky-200/70">Suggested next step</div>
            <div className="mt-0.5 font-medium text-white">{suggested.label}</div>
          </div>
          <ArrowRight className="h-4 w-4 text-sky-200/80" />
        </Link>
      )}

      <StoryPipeline steps={pipelineSteps} />
      <InfraStatus />

      <div className="grid gap-4 lg:grid-cols-2">
        {children.map((c: any, i: number) => {
          const row = totals[c.id];
          const total = row?.total;
          return (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={`/app/children/${c.id}`}
                className="group block rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20 hover:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-medium">{c.displayName}</div>
                    <div className="text-xs text-white/50">
                      Age {c.ageYears} · {friendlyRisk(c.riskTier)}
                    </div>
                  </div>
                  {c.paused && <StatusPip tone="warn" label="Paused" />}
                </div>
                <div className="mt-5 text-3xl font-medium tracking-tight">{total == null ? "-" : fmtUsd(total)}</div>
                <div className="mt-1 text-xs text-white/45">
                  {total === 0 ? "Ready for their first investment" : "Portfolio value"}
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-white/50 group-hover:text-white">
                  View portfolio <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Weekly allowance">
          {policies.length === 0 ? (
            <EmptyState
              title="No allowance yet"
              detail="Set a weekly amount and HATCH invests it automatically."
              actionLabel="Set allowance"
              onAction={() => nav(`/app/children/${children[0].id}/allowance`)}
            />
          ) : (
            <div className="space-y-2 text-sm">
              {policies.slice(0, 3).map((p: any) => (
                <Link
                  key={p.id}
                  to={`/app/children/${p.childId}/allowance`}
                  className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04]"
                >
                  <div>
                    <div className="font-medium">
                      {fmtUsd(p.amountUsd)} <span className="text-white/45">every week</span>
                    </div>
                    <div className="text-xs text-white/45">Next {fmtRelative(p.nextDueAt)}</div>
                  </div>
                  <StatusPip tone={p.paused ? "warn" : "ok"} label={p.paused ? "Paused" : "Active"} />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Learning & readiness">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <span className="text-white/70">Trading account</span>
              <StatusPip tone={ready.tone} label={ready.label} />
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <BookOpen className="mt-0.5 h-4 w-4 text-white/40" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white/45">Latest lesson</div>
                <div className="truncate font-medium text-white/90">
                  {latestLesson ? friendlyLessonTitle(latestLesson) : "Generate a lesson from their portfolio"}
                </div>
              </div>
              {children[0] && (
                <Link to={`/app/children/${children[0].id}/lessons`} className="text-xs text-white/50 hover:text-white">
                  Open
                </Link>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function OutcomeTile({
  label,
  value,
  hint,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  icon: any;
  highlight?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 ${highlight ? "border-amber-400/25 bg-amber-400/[0.06]" : "border-white/8 bg-white/[0.02]"}`}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/40">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} /> {label}
      </div>
      <div className="mt-2 text-2xl font-medium tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-white/45">{hint}</div>
    </motion.div>
  );
}
