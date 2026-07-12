import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { fmtRelative } from "@/lib/format";
import { InvestmentReceipt } from "@/components/story/InvestmentReceipt";
import { Activity as ActivityIcon } from "lucide-react";

export default function Activity() {
  const [handoffs, orders] = useQueries({
    queries: [
      { queryKey: ["allowances", "handoffs"], queryFn: () => api.get<any>("/api/allowances/handoffs") },
      { queryKey: ["diag-orders"], queryFn: () => api.get<any>("/api/diag/orders"), refetchInterval: 20_000 },
    ],
  });

  const approvalRows = (handoffs.data?.handoffs || []).map((h: any) => ({
    kind: "approval" as const,
    at: h.createdAt || h.at,
    handoff: h,
  }));

  const orderRows = (orders.data?.orders || orders.data || []).map((o: any) => ({
    kind: "order" as const,
    at: o.createdAt || o.at,
    order: o,
  }));

  const rows = [...approvalRows, ...orderRows].sort(
    (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime(),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-white/50">Approvals and investments with full receipts.</p>
      </div>
      <SectionCard title="Recent">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            detail="When you approve a weekly investment, it will show up here."
            icon={ActivityIcon}
          />
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 40).map((r, i) =>
              r.kind === "order" ? (
                <InvestmentReceipt key={r.order?.id || i} order={r.order} />
              ) : (
                <div
                  key={r.handoff?.id || i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-white/35">Approval</div>
                    <div className="truncate text-white/85">
                      {r.handoff.status === "pending" || !r.handoff.status
                        ? "Weekly investment waiting for your approval"
                        : `Weekly investment · ${String(r.handoff.status)}`}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-white/40">{fmtRelative(r.at)}</span>
                </div>
              ),
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
