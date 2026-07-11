import PublicNav from "@/components/layout/PublicNav";
import Footer from "@/components/layout/Footer";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatusPip } from "@/components/common/StatusPip";
import { SectionCard } from "@/components/common/SectionCard";
import { Unavailable } from "@/components/common/Unavailable";

export default function Diag() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<any>("/api/health", { auth: false }), refetchInterval: 15_000 });
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: () => api.get<any>("/api/metrics", { auth: false }), refetchInterval: 15_000 });
  const vc = useQuery({ queryKey: ["vc", "mainnet"], queryFn: () => api.get<any>("/api/valuechain/contracts?network=mainnet", { auth: false }) });

  return (
    <div className="min-h-screen bg-black text-white">
      <PublicNav />
      <main className="mx-auto max-w-5xl px-6 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Diagnostics</h1>
          <p className="mt-1 text-sm text-white/60">Live checks against the production backend.</p>
        </div>

        <SectionCard title="Health checks">
          {health.isLoading ? (
            <div className="text-sm text-white/50">Loading…</div>
          ) : health.data ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(health.data.checks || {}).map(([k, v]: any) => (
                <div key={k} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                  <span className="capitalize">{k}</span>
                  <StatusPip tone={v?.ok ? "ok" : "danger"} label={v?.ok ? `${v?.ms ?? 0}ms` : "down"} />
                </div>
              ))}
            </div>
          ) : <Unavailable />}
        </SectionCard>

        <SectionCard title="Profile & kill switch">
          {metrics.data ? (
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <Row k="Profile" v={metrics.data.profile} />
              <Row k="Kill switch" v={metrics.data.killSwitch ? "ON — trading paused" : "off"} tone={metrics.data.killSwitch ? "danger" : "ok"} />
              <Row k="Custody" v={metrics.data.custody?.backendOwnsSodexTradingKeys ? "backend" : "non-custodial"} tone={metrics.data.custody?.backendOwnsSodexTradingKeys ? "warn" : "ok"} />
              <Row k="Jobs queue" v={String(metrics.data.jobs?.queue ?? "—")} />
              <Row k="Users" v={String(metrics.data.counts?.users ?? "—")} />
              <Row k="Children" v={String(metrics.data.counts?.children ?? "—")} />
            </div>
          ) : <Unavailable />}
        </SectionCard>

        <SectionCard title="ValueChain contracts (mainnet)">
          {vc.data ? (
            <pre className="overflow-x-auto rounded-lg bg-white/[0.02] p-3 font-mono text-[11px] text-white/70">{JSON.stringify(vc.data, null, 2)}</pre>
          ) : <Unavailable />}
        </SectionCard>
      </main>
      <Footer />
    </div>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="text-xs text-white/50">{k}</div>
      <div className="mt-1 flex items-center gap-2 font-mono text-sm">{tone ? <StatusPip tone={tone} /> : null}{v}</div>
    </div>
  );
}
