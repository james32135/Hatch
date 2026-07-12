import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { friendlyMarket, friendlyReadiness } from "@/lib/copy";

export default function Sodex() {
  const meta = useQuery({ queryKey: ["sodex-meta"], queryFn: () => api.get<any>("/api/sodex/meta", { auth: false }) });
  const readiness = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const symbols = useQuery({ queryKey: ["sodex-symbols"], queryFn: () => api.get<any>("/api/sodex/markets/symbols", { auth: false }) });
  const rows = symbols.data?.data?.data || [];
  const ready = friendlyReadiness(readiness.data?.nextStep);

  const focus = rows.filter(
    (r: any) => [3, 26, 13].includes(r.id) || r.baseCoin?.includes("MAG7") || r.baseCoin?.includes("USSI"),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Trading</h1>
        <p className="mt-1 max-w-xl text-sm text-white/55">
          Your wallet stays yours. HATCH prepares investments; you approve them.
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

      <SectionCard title="Available investments" subtitle="Markets used for weekly allowance investing.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-white/40">
              <tr>
                <th className="pb-2 text-left font-normal">Investment</th>
                <th className="pb-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {focus.map((r: any) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2.5">
                    <div className="font-medium text-white/90">{friendlyMarket(r.baseCoin || r.name)}</div>
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusPip tone={r.status === "TRADING" ? "ok" : "warn"} label={r.status === "TRADING" ? "Open" : r.status} />
                  </td>
                </tr>
              ))}
              {focus.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-white/50">
                    Markets loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
