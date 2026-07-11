import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { fmtRelative } from "@/lib/format";

export default function Notifications() {
  const handoffs = useQuery({ queryKey: ["allowances", "handoffs"], queryFn: () => api.get<any>("/api/allowances/handoffs") });
  const readiness = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const items: any[] = [];
  (handoffs.data?.handoffs || []).forEach((h: any) => items.push({ kind: "handoff", tone: "warn", text: "Allowance handoff needs your signature", at: h.createdAt }));
  if (readiness.data && readiness.data.nextStep !== "READY") items.push({ kind: "sodex", tone: "warn", text: `SoDEX not ready — ${readiness.data.nextStep}`, at: new Date().toISOString() });

  return (
    <SectionCard title="Notifications">
      {items.length === 0 ? <div className="text-sm text-white/50">You're all caught up.</div> : (
        <div className="space-y-2">
          {items.map((n, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm">
              <div className="flex items-center gap-3"><StatusPip tone={n.tone as any} /><span>{n.text}</span></div>
              <span className="text-xs text-white/40">{fmtRelative(n.at)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
