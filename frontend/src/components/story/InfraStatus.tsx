import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/useSession";
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { friendlyProfile } from "@/lib/copy";

type Tone = "ok" | "warn" | "danger" | "info";

function toneFrom(ok: boolean | undefined, loading?: boolean): Tone {
  if (loading) return "info";
  if (ok === true) return "ok";
  if (ok === false) return "danger";
  return "warn";
}

const toneClass: Record<Tone, string> = {
  ok: "bg-emerald-400",
  warn: "bg-amber-400",
  danger: "bg-rose-400",
  info: "bg-sky-400/70",
};

export function useInfraLive() {
  const { profile } = useSession();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<any>("/api/health", { auth: false }),
    refetchInterval: 30_000,
  });
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<any>("/api/config", { auth: false }),
    staleTime: 60_000,
  });
  const ssi = useQuery({
    queryKey: ["ssi-capabilities"],
    queryFn: () => api.get<any>("/api/ssi/capabilities", { auth: false }),
    staleTime: 60_000,
  });
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: () => api.get<any>("/api/metrics", { auth: false }),
    refetchInterval: 60_000,
  });
  const network = profile === "mainnet" || profile === "mainnet-readonly" ? "mainnet" : "testnet";
  const vc = useQuery({
    queryKey: ["vc-contracts", network],
    queryFn: () => api.get<any>(`/api/valuechain/contracts?network=${network}`, { auth: false }),
    staleTime: 60_000,
  });

  const checks = health.data?.checks || {};
  const pathA = ssi.data?.pathA_sodexVault?.mint === true;

  return {
    profile,
    network,
    loading: health.isLoading,
    backendOk: health.data?.ok === true,
    sodexOk: checks.sodex?.ok === true,
    ssiOk: pathA || checks.baseRpc?.ok === true,
    valuechainOk: checks.valuechainRpc?.ok === true || vc.data?.ok === true,
    aiOk: checks.ai?.ok === true,
    postgresOk: checks.postgres?.ok === true,
    redisOk: checks.redis?.ok === true || metrics.data?.redis?.ok === true,
    explorer: vc.data?.explorer,
    config: config.data,
    health: health.data,
    metrics: metrics.data,
    ssi: ssi.data,
    vc: vc.data,
  };
}

/** Compact trust strip for Home and key screens. */
export function InfraStatus({ compact = false }: { compact?: boolean }) {
  const live = useInfraLive();
  const items = [
    { label: "SoDEX", ok: live.sodexOk, hint: "Trading" },
    { label: "SSI", ok: live.ssiOk, hint: "Indexes" },
    { label: "ValueChain", ok: live.valuechainOk, hint: "Records" },
    { label: "AI", ok: live.aiOk, hint: "Lessons" },
    { label: "Backend", ok: live.backendOk, hint: "Live" },
  ];

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.02] ${compact ? "p-3" : "p-4 md:p-5"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white/90">Trusted infrastructure</div>
          {!compact && (
            <p className="mt-0.5 text-xs text-white/45">
              Live connections powering HATCH on {friendlyProfile(live.profile)}.
            </p>
          )}
        </div>
        <Link to="/app/transparency" className="text-xs text-sky-200/80 hover:text-sky-100">
          Transparency center
        </Link>
      </div>

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"}`}>
        {items.map((item, i) => {
          const tone = toneFrom(item.ok, live.loading);
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 120, damping: 18 }}
              className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-black/30 px-3 py-2.5"
            >
              <span className="relative flex h-2 w-2">
                {tone === "ok" && (
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${toneClass[tone]} opacity-40`} />
                )}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${toneClass[tone]}`} />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm text-white/90">{item.label}</div>
                <div className="text-[10px] text-white/40">
                  {live.loading ? "Checking…" : item.ok ? `Connected · ${item.hint}` : "Unavailable"}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {!compact && live.explorer?.log && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
          <a href={live.explorer.log} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">
            Activity log <ExternalLink className="h-3 w-3" />
          </a>
          {live.explorer.schedule && (
            <a href={live.explorer.schedule} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">
              Schedule <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {live.config?.sodex?.appUrl && (
            <a href={live.config.sodex.appUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-white">
              SoDEX app <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
