import type { ReactNode } from "react";
import { useInfraLive } from "@/components/story/InfraStatus";
import { friendlyProfile } from "@/lib/copy";
import { ExternalLink } from "lucide-react";
import { shortAddr } from "@/lib/format";

/** Elegant live environment / network panel — Settings, Transparency, Home. */
export function NetworkEnvironment({
  wallet,
  showSwitchHint = false,
}: {
  wallet?: string | null;
  showSwitchHint?: boolean;
}) {
  const live = useInfraLive();
  const sodex = live.config?.sodex;
  const vcNet = live.config?.valuechain?.[live.network];
  const ssi = live.config?.ssiProtocol;
  const isMain = live.network === "mainnet";

  const rows: Array<{ k: string; v: ReactNode }> = [
    {
      k: "Current environment",
      v: (
        <span className="font-medium text-white/90">
          {isMain ? "Mainnet" : "Testnet"} · {friendlyProfile(live.profile)}
        </span>
      ),
    },
    {
      k: "SoDEX",
      v: (
        <span className="text-right">
          <span className="block font-medium text-white/90">{isMain ? "Mainnet" : "Testnet"}</span>
          {sodex?.spotRest && (
            <span className="block font-mono text-[10px] text-white/40">{sodex.spotRest.replace(/^https?:\/\//, "")}</span>
          )}
        </span>
      ),
    },
    {
      k: "SSI",
      v: (
        <span className="text-right">
          <span className="block font-medium text-white/90">Base · SoSoValue Indexes</span>
          {ssi?.siteUrl && (
            <a href={ssi.siteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-sky-200/70 hover:text-sky-100">
              ssi.sosovalue.com <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </span>
      ),
    },
    {
      k: "ValueChain",
      v: (
        <span className="text-right">
          <span className="block font-medium text-white/90">
            {isMain ? "Mainnet" : "Testnet"}
            {vcNet?.chainId != null ? ` · chain ${vcNet.chainId}` : ""}
          </span>
          {vcNet?.explorerUrl && (
            <a href={vcNet.explorerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-sky-200/70 hover:text-sky-100">
              Explorer <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </span>
      ),
    },
    {
      k: "Backend",
      v: (
        <span className="font-medium text-white/90">
          {live.backendOk ? "Live" : "Unavailable"} · {live.health?.profile || live.metrics?.profile || "API"}
        </span>
      ),
    },
  ];

  if (wallet) {
    rows.push({
      k: "Wallet",
      v: <span className="font-mono text-white/80">{shortAddr(wallet)}</span>,
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-white/90">Current environment</div>
          <p className="mt-0.5 text-xs text-white/45">
            Mainnet and testnet stay separate. Every read uses this profile.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${
            isMain ? "bg-emerald-400/15 text-emerald-200" : "bg-sky-400/15 text-sky-200"
          }`}
        >
          {isMain ? "Mainnet" : "Testnet"}
        </span>
      </div>

      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.k} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <span className="shrink-0 text-white/45">{r.k}</span>
            <div className="min-w-0">{r.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {sodex?.appUrl && (
          <a href={sodex.appUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100">
            SoDEX app <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {live.explorer?.log && (
          <a href={live.explorer.log} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100">
            ValueChain log <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {live.explorer?.schedule && (
          <a href={live.explorer.schedule} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100">
            Schedule <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {showSwitchHint && (
        <p className="mt-3 text-[11px] text-white/35">Switch network above. Practice never touches live funds.</p>
      )}
    </div>
  );
}
