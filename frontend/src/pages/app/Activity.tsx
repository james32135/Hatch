import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { fmtRelative } from "@/lib/format";
import { friendlyTxLabel, friendlyMarket } from "@/lib/copy";
import { Activity as ActivityIcon } from "lucide-react";

export default function Activity() {
  const [handoffs, orders] = useQueries({
    queries: [
      { queryKey: ["allowances", "handoffs"], queryFn: () => api.get<any>("/api/allowances/handoffs") },
      { queryKey: ["diag-orders"], queryFn: () => api.get<any>("/api/diag/orders") },
    ],
  });

  const rows: any[] = [
    ...((handoffs.data?.handoffs || []).map((h: any) => ({
      kind: "Approval",
      at: h.createdAt || h.at,
      detail:
        h.status === "pending" || !h.status
          ? "Weekly investment waiting for your approval"
          : `Weekly investment · ${String(h.status)}`,
    }))),
    ...((orders.data?.orders || orders.data || []).map((o: any) => ({
      kind: "Investment",
      at: o.createdAt || o.at,
      detail: friendlyTxLabel({
        side: o.side,
        symbolName: o.symbolName || o.symbol,
        kind: o.status || o.state,
      }),
      market: friendlyMarket(o.symbolName || o.symbol),
      status: o.status || o.state,
    }))),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-white/50">Approvals and investments in one place.</p>
      </div>
      <SectionCard title="Recent">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            detail="When you approve a weekly investment, it will show up here."
            icon={ActivityIcon}
          />
        ) : (
          <div className="space-y-1.5">
            {rows.slice(0, 40).map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">{r.kind}</div>
                  <div className="truncate text-white/85">{r.detail}</div>
                </div>
                <span className="shrink-0 text-xs text-white/40">{fmtRelative(r.at)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
