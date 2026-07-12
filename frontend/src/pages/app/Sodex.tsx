import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { friendlyReadiness } from "@/lib/copy";
import { fmtUsd } from "@/lib/format";

export default function Sodex() {
  const meta = useQuery({
    queryKey: ["sodex-meta"],
    queryFn: () => api.get<any>("/api/sodex/meta", { auth: false }),
  });
  const readiness = useQuery({
    queryKey: ["sodex-readiness"],
    queryFn: () => api.get<any>("/api/sodex/readiness"),
  });
  const discovery = useQuery({
    queryKey: ["eligible-markets-trading", 5],
    queryFn: () =>
      api.get<any>("/api/sodex/markets/executable?notionalUsd=5", { auth: false }),
    refetchInterval: 30_000,
  });
  const ready = friendlyReadiness(readiness.data?.nextStep);
  const available = discovery.data?.available || [];
  const unavailable = discovery.data?.unavailable || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Trading</h1>
        <p className="mt-1 max-w-xl text-sm text-white/55">
          Your wallet stays yours. Only markets with signed matcher capability appear here.
        </p>
      </div>

      <SectionCard title="Account status">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusPip tone={ready.tone} label={ready.label} />
          <StatusPip tone="ok" label="You hold the keys" />
          <StatusPip tone="ok" label="Verified connection" />
          {meta.data?.appUrl && (
            <Button asChild size="sm" variant="secondary" className="ml-auto bg-white/5 hover:bg-white/10">
              <a href={meta.data.appUrl} target="_blank" rel="noreferrer">
                Open trading app <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
        <div className="mt-4">
          <AdvancedDetails label="Developer details">
            <div className="space-y-1 font-mono text-xs text-white/50">
              <div>status: {readiness.data?.nextStep || "—"}</div>
              <div>custody: {String(readiness.data?.custody ?? false)}</div>
              {readiness.data?.accountId != null && <div>account: {readiness.data.accountId}</div>}
            </div>
          </AdvancedDetails>
        </div>
      </SectionCard>

      <SectionCard
        title="Markets you can actually buy right now"
        subtitle="Signed matcher capability required — dry reads alone never qualify."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-white/40">
              <tr>
                <th className="pb-2 text-left font-normal">Market</th>
                <th className="pb-2 text-right font-normal">Trading</th>
                <th className="pb-2 text-right font-normal">Capability</th>
                <th className="pb-2 text-right font-normal">Depth</th>
              </tr>
            </thead>
            <tbody>
              {available.map((m: any) => (
                <tr key={m.symbol} className="border-t border-white/5">
                  <td className="py-2.5">
                    <div className="font-medium text-white/90">{m.symbol}</div>
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusPip
                      tone={m.tradingEnabled ? "ok" : "danger"}
                      label={m.tradingEnabled ? "YES" : "NO"}
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusPip
                      tone={
                        m.gatewayValidation === "MATCHER_OK" || m.gatewayValidation === "FILL_OK"
                          ? "ok"
                          : m.gatewayValidation === "CANCEL_ONLY"
                            ? "danger"
                            : "warn"
                      }
                      label={m.gatewayValidation || "UNVERIFIED"}
                    />
                  </td>
                  <td className="py-2.5 text-right font-mono text-white/60">
                    {fmtUsd(m.askDepthUsd)}
                  </td>
                </tr>
              ))}
              {!discovery.isLoading && available.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-white/50">
                    No matcher-capable markets right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {unavailable.length > 0 && (
          <div className="mt-4 text-xs text-white/40">
            Unavailable:{" "}
            {unavailable
              .slice(0, 8)
              .map((m: any) => `${m.symbol} (${m.reason})`)
              .join(" · ")}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
