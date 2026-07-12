import type { ReactNode } from "react";
import { useInfraLive } from "@/components/story/InfraStatus";
import { ExplorerLinkCard } from "@/components/story/ExplorerLink";
import { ProductFlowSvg } from "@/components/story/ProductFlowSvg";
import { NetworkEnvironment } from "@/components/story/NetworkEnvironment";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { friendlyProfile } from "@/lib/copy";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
      <span className="text-sm text-white/50">{label}</span>
      <div className="text-right text-sm text-white/85">{children}</div>
    </div>
  );
}

export function Transparency() {
  const live = useInfraLive();
  const { address } = useAccount();
  const m = live.metrics;
  const counts = m?.counts || {};
  const hatchLogAddr =
    live.vc?.hatchLog?.address ||
    live.config?.hatchContracts?.[live.network]?.log ||
    null;
  const scheduleRaw =
    live.vc?.hatchSchedule?.address ||
    live.config?.hatchContracts?.[live.network]?.schedule ||
    null;
  const scheduleAddr = scheduleRaw ? String(scheduleRaw) : null;
  const explorer = live.explorer || live.vc?.explorer;
  const sodex = live.config?.sodex;
  const vcNet = live.config?.valuechain?.[live.network];
  const checks = live.health?.checks || {};

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Transparency</h1>
        <p className="mt-1 max-w-xl text-sm text-white/50">
          Live systems behind HATCH. Every number in the app must come from these sources. HATCH never invents balances.
        </p>
      </div>

      <ProductFlowSvg />
      <NetworkEnvironment wallet={address} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <SectionCard title="Live infrastructure" subtitle={`Profile: ${friendlyProfile(live.profile)}`}>
          <div className="space-y-1">
            <Row label="Backend">
              <StatusPip tone={live.backendOk ? "ok" : "danger"} label={live.backendOk ? "Live" : "Down"} />
            </Row>
            <Row label="Database">
              <StatusPip tone={live.postgresOk ? "ok" : "warn"} label={live.postgresOk ? "Connected" : "Check"} />
            </Row>
            <Row label="Redis">
              <StatusPip tone={live.redisOk ? "ok" : "warn"} label={live.redisOk ? "Connected" : "Check"} />
            </Row>
            <Row label="SoDEX">
              <StatusPip tone={live.sodexOk ? "ok" : "danger"} label={live.sodexOk ? "Connected" : "Unavailable"} />
            </Row>
            <Row label="SSI">
              <StatusPip tone={live.ssiOk ? "ok" : "warn"} label={live.ssiOk ? "Connected" : "Check"} />
            </Row>
            <Row label="ValueChain">
              <StatusPip tone={live.valuechainOk ? "ok" : "warn"} label={live.valuechainOk ? "Connected" : "Check"} />
            </Row>
            <Row label="AI lessons">
              <StatusPip tone={live.aiOk ? "ok" : "warn"} label={live.aiOk ? "Connected" : "Check"} />
            </Row>
            <Row label="Contracts">
              <StatusPip
                tone={hatchLogAddr || scheduleAddr ? "ok" : "warn"}
                label={hatchLogAddr || scheduleAddr ? "Deployed" : "Pending"}
              />
            </Row>
            <Row label="Explorer">
              <StatusPip tone={explorer?.log ? "ok" : "warn"} label={explorer?.log ? "Linked" : "Check"} />
            </Row>
            <Row label="Network">{live.network === "mainnet" ? "Mainnet" : "Testnet"}</Row>
            <Row label="SoDEX endpoint">
              <span className="font-mono text-[11px] text-white/60">
                {(sodex?.spotRest || sodex?.baseUrl || "-").replace(/^https?:\/\//, "")}
              </span>
            </Row>
            <Row label="ValueChain RPC">
              <span className="font-mono text-[11px] text-white/60">
                {(vcNet?.rpcUrl || "-").replace(/^https?:\/\//, "")}
              </span>
            </Row>
            <Row label="SSI environment">Base · SoSoValue Indexes</Row>
            <Row label="Backend environment">
              {live.health?.profile || live.metrics?.profile || friendlyProfile(live.profile)}
            </Row>
            {checks.sodex?.latencyMs != null && <Row label="SoDEX latency">{`${checks.sodex.latencyMs} ms`}</Row>}
          </div>
        </SectionCard>

        <SectionCard title="Activity (24h)" subtitle="From live metrics">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Orders", counts.orders24h ?? 0],
              ["Lessons", counts.lessonsReady24h ?? 0],
              ["Relays", counts.relays24h ?? 0],
              ["Handoffs", counts.handoffs24h ?? 0],
            ].map(([k, v], i) => (
              <motion.div
                key={String(k)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl border border-white/8 bg-black/25 p-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-white/35">{k}</div>
                <div className="mt-1 font-mono text-xl text-white">{v}</div>
              </motion.div>
            ))}
          </div>
          {m?.killSwitch === true && (
            <p className="mt-3 text-xs text-amber-200/80">Safety pause is active on the backend.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Contracts & explorers" subtitle="Public verification on ValueChain">
        <div className="space-y-2">
          {hatchLogAddr && (
            <ExplorerLinkCard
              title="HATCH activity log"
              status="Deployed"
              hash={hatchLogAddr}
              explorerUrl={explorer?.log}
              networkLabel={`${live.network} · ValueChain`}
              detail="On-chain log for allowance and learning events."
            />
          )}
          {scheduleAddr && (
            <ExplorerLinkCard
              title="Allowance schedule"
              status="Deployed"
              hash={scheduleAddr}
              explorerUrl={explorer?.schedule}
              networkLabel={`${live.network} · ValueChain`}
              detail="Public schedule contract for recurring investments."
            />
          )}
          {!hatchLogAddr && !scheduleAddr && (
            <p className="text-sm text-white/45">Contract addresses load from the live config for this network.</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {sodex?.appUrl && (
            <a
              href={sodex.appUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
            >
              SoDEX <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {live.config?.ssiProtocol?.siteUrl && (
            <a
              href={live.config.ssiProtocol.siteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
            >
              SSI protocol <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {(explorer?.log || vcNet?.explorerUrl) && (
            <a
              href={explorer?.log || `${vcNet?.explorerUrl}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
            >
              ValueChain explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </SectionCard>

      <SectionCard title="AI providers" subtitle="Lesson generation">
        <div className="flex flex-wrap gap-2">
          {(m?.aiProviders || live.config?.aiProviders?.map((p: any) => p.id) || ["configured"]).map((p: string) => (
            <span key={p} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/70">
              {p}
            </span>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
