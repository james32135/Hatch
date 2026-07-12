import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { StatusPip } from "@/components/common/StatusPip";
import { orderNotionalUsd } from "@/lib/portfolio";
import { friendlyTxLabel, friendlyMarket } from "@/lib/copy";
import { fmtDate, fmtUsd, shortAddr } from "@/lib/format";
import { ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { useInfraLive } from "@/components/story/InfraStatus";

type OrderLike = {
  id?: string;
  clOrdId?: string;
  sodexOrderId?: string | null;
  status?: string;
  state?: string;
  side?: string;
  symbolName?: string;
  symbol?: string;
  quantity?: string | number | null;
  price?: string | number | null;
  notionalUsd?: number | null;
  amountUsd?: number | null;
  createdAt?: string;
  at?: string;
  environment?: string;
  error?: string | null;
};

function toneFor(status: string): "ok" | "warn" | "danger" | "info" {
  const s = status.toUpperCase();
  if (["FILLED", "DONE", "COMPLETED", "SUCCESS"].some((x) => s.includes(x))) return "ok";
  if (["FAILED", "REJECTED", "CANCELLED", "CANCELED", "EXPIRED"].some((x) => s.includes(x))) return "danger";
  if (["PENDING", "OPEN", "NEW", "SUBMITTED", "WAITING"].some((x) => s.includes(x))) return "warn";
  return "info";
}

export function InvestmentReceipt({
  order,
  sodexAppUrl,
}: {
  order: OrderLike;
  sodexAppUrl?: string | null;
}) {
  const live = useInfraLive();
  const status = String(order.status || order.state || "UNKNOWN");
  const notional = orderNotionalUsd(order);
  const orderId = order.sodexOrderId || order.clOrdId || order.id;
  const at = order.at || order.createdAt;
  const sodexUrl = sodexAppUrl || live.config?.sodex?.appUrl;

  const copy = () => {
    if (!orderId) return;
    navigator.clipboard.writeText(String(orderId));
    toast.success("Copied");
  };

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm text-white/90">{friendlyTxLabel(order)}</div>
          <div className="mt-0.5 text-xs text-white/40">
            {at ? fmtDate(at) : "-"}
            {order.environment ? ` · ${order.environment}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <StatusPip tone={toneFor(status)} label={status} />
          {notional != null && (
            <div className="mt-1 font-mono text-xs text-white/70">{fmtUsd(notional)}</div>
          )}
        </div>
      </div>

      <div className="mt-2">
        <AdvancedDetails label="Receipt">
          <div className="space-y-2 text-xs text-white/55">
            {orderId && (
              <div className="flex items-center justify-between gap-2 font-mono">
                <span>Order {shortAddr(String(orderId))}</span>
                <button type="button" onClick={copy} className="text-white/40 hover:text-white" aria-label="Copy order id">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div>Market: {friendlyMarket(order.symbolName || order.symbol)}</div>
            {order.quantity != null && <div>Quantity: {String(order.quantity)}</div>}
            {order.price != null && Number(order.price) > 0 && <div>Price: {String(order.price)}</div>}
            {order.error && <div className="text-rose-300/80">{order.error}</div>}
            <div className="flex flex-wrap gap-3 pt-1">
              {sodexUrl && (
                <a href={sodexUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100">
                  View on SoDEX <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {/* HATCHLog contract page is for Transparency only — not an order receipt */}
            </div>
          </div>
        </AdvancedDetails>
      </div>
    </div>
  );
}
