import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, ExternalLink, ShieldCheck } from "lucide-react";

function Contracts({ network }: { network: "mainnet" | "testnet" }) {
  const q = useQuery({
    queryKey: ["vc", network],
    queryFn: () => api.get<any>(`/api/valuechain/contracts?network=${network}`, { auth: false }),
  });
  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };
  const label = network === "mainnet" ? "Live network" : "Practice network";

  return (
    <SectionCard title={label}>
      {q.data ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-white/70">
            <StatusPip tone={q.data.ok || q.data.hatchLog?.bytecode ? "ok" : "warn"} label="Independent verification available" />
          </div>
          <AdvancedDetails label="Contract addresses">
            <div className="space-y-3">
              <AddrRow
                name="Activity log"
                address={q.data.hatchLog?.address}
                ok={!!q.data.hatchLog?.bytecode}
                explorer={q.data.explorer?.log}
                onCopy={copy}
              />
              <AddrRow
                name="Schedule"
                address={q.data.hatchSchedule?.address}
                ok={!!q.data.hatchSchedule?.bytecode}
                explorer={q.data.explorer?.schedule}
                onCopy={copy}
              />
            </div>
          </AdvancedDetails>
        </div>
      ) : (
        <div className="text-sm text-white/50">Loading…</div>
      )}
    </SectionCard>
  );
}

function AddrRow({
  name,
  address,
  ok,
  explorer,
  onCopy,
}: {
  name: string;
  address?: string;
  ok: boolean;
  explorer?: string;
  onCopy: (t: string) => void;
}) {
  if (!address) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-black/30 p-3">
      <div className="min-w-0">
        <div className="text-xs text-white/45">{name}</div>
        <div className="truncate font-mono text-xs text-white/80">{address}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <StatusPip tone={ok ? "ok" : "danger"} label={ok ? "Verified" : "Missing"} />
        <Button size="sm" variant="ghost" onClick={() => onCopy(address)}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {explorer && (
          <Button size="sm" variant="ghost" asChild>
            <a href={explorer} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ValueChain() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Security</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
          Every important action can be recorded on-chain and checked independently. HATCH never holds your funds.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-50/90">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.5} />
        <p>
          Transparency without custody. Records exist so parents, auditors, and partners can verify what happened —
          not so HATCH can move money without you.
        </p>
      </div>

      <Contracts network="mainnet" />
      <Contracts network="testnet" />
    </div>
  );
}
