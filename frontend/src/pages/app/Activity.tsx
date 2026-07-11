import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { fmtRelative } from "@/lib/format";

export default function Activity() {
  const [handoffs, orders] = useQueries({
    queries: [
      { queryKey: ["allowances", "handoffs"], queryFn: () => api.get<any>("/api/allowances/handoffs") },
      { queryKey: ["diag-orders"], queryFn: () => api.get<any>("/api/diag/orders") },
    ],
  });

  const rows: any[] = [
    ...((handoffs.data?.handoffs || []).map((h: any) => ({ t: "handoff", at: h.createdAt || h.at, detail: `Allowance handoff — ${h.status || "pending"}` }))),
    ...((orders.data?.orders || orders.data || []).map((o: any) => ({ t: "order", at: o.createdAt || o.at, detail: `Order ${o.status || o.state}` }))),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <SectionCard title="Activity">
      {rows.length === 0 ? <div className="text-sm text-white/50">Nothing yet.</div> : (
        <div className="space-y-1">
          {rows.slice(0, 40).map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2 text-sm">
              <span><span className="text-xs uppercase text-white/40 mr-2">{r.t}</span>{r.detail}</span>
              <span className="text-xs text-white/40">{fmtRelative(r.at)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
