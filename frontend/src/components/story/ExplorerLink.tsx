import { ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { StatusPip } from "@/components/common/StatusPip";
import { shortAddr } from "@/lib/format";

export function ExplorerLinkCard({
  title,
  status,
  statusTone = "ok",
  hash,
  explorerUrl,
  networkLabel,
  detail,
}: {
  title: string;
  status: string;
  statusTone?: "ok" | "warn" | "danger" | "info";
  hash?: string | null;
  explorerUrl?: string | null;
  networkLabel?: string;
  detail?: string;
}) {
  const copy = () => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    toast.success("Copied");
  };

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm text-white/90">{title}</div>
          {networkLabel && <div className="text-[10px] text-white/40">{networkLabel}</div>}
        </div>
        <StatusPip tone={statusTone} label={status} />
      </div>
      {(hash || explorerUrl || detail) && (
        <div className="mt-2">
          <AdvancedDetails label="Confirmation details">
            <div className="space-y-2 text-xs text-white/55">
              {detail && <p>{detail}</p>}
              {hash && (
                <div className="flex items-center justify-between gap-2 font-mono">
                  <span>{shortAddr(hash)}</span>
                  <button type="button" onClick={copy} className="text-white/50 hover:text-white" aria-label="Copy">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
                >
                  View on explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </AdvancedDetails>
        </div>
      )}
    </div>
  );
}
