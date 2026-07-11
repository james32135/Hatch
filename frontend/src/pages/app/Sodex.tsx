import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function Sodex() {
  const meta = useQuery({ queryKey: ["sodex-meta"], queryFn: () => api.get<any>("/api/sodex/meta", { auth: false }) });
  const readiness = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const symbols = useQuery({ queryKey: ["sodex-symbols"], queryFn: () => api.get<any>("/api/sodex/markets/symbols", { auth: false }) });
  const rows = symbols.data?.data?.data || [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">SoDEX</h1>
      <SectionCard title="Readiness">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <StatusPip tone={readiness.data?.nextStep === "READY" ? "ok" : "warn"} label={readiness.data?.nextStep || "—"} />
          <span className="text-white/60">Custody: <span className="font-mono">{String(readiness.data?.custody ?? false)}</span></span>
          {readiness.data?.accountId && <span className="text-white/60">Account: <span className="font-mono">{readiness.data.accountId}</span></span>}
          {meta.data?.appUrl && (
            <Button asChild size="sm" variant="secondary" className="ml-auto bg-white/5 hover:bg-white/10">
              <a href={meta.data.appUrl} target="_blank" rel="noreferrer">Open SoDEX <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
            </Button>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Symbols">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-white/40"><tr><th className="pb-2 text-left font-normal">Pair</th><th className="pb-2 text-left font-normal">ID</th><th className="pb-2 text-left font-normal">Base</th><th className="pb-2 text-right font-normal">Status</th></tr></thead>
            <tbody>
              {rows.filter((r: any) => [3, 26, 13].includes(r.id) || r.baseCoin?.includes("MAG7") || r.baseCoin?.includes("USSI")).map((r: any) => (
                <tr key={r.id} className="border-t border-white/5">
                  <td className="py-2 font-mono">{r.name}</td>
                  <td className="py-2 font-mono text-white/50">{r.id}</td>
                  <td className="py-2 font-mono">{r.baseCoin}</td>
                  <td className="py-2 text-right"><StatusPip tone={r.status === "TRADING" ? "ok" : "warn"} label={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
