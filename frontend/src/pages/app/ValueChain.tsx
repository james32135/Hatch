import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";

function Contracts({ network }: { network: "mainnet" | "testnet" }) {
  const q = useQuery({ queryKey: ["vc", network], queryFn: () => api.get<any>(`/api/valuechain/contracts?network=${network}`, { auth: false }) });
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  return (
    <SectionCard title={network === "mainnet" ? "Mainnet 286623" : "Testnet 138565"}>
      {q.data ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div>
              <div className="text-xs text-white/50">HATCHLog</div>
              <div className="font-mono text-white">{q.data.hatchLog?.address}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPip tone={q.data.hatchLog?.bytecode ? "ok" : "danger"} label={q.data.hatchLog?.bytecode ? "bytecode ok" : "no bytecode"} />
              <Button size="sm" variant="ghost" onClick={() => copy(q.data.hatchLog.address)}><Copy className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" asChild><a href={q.data.explorer?.log} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div>
              <div className="text-xs text-white/50">HATCHSchedule</div>
              <div className="font-mono text-white">{q.data.hatchSchedule?.address}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPip tone={q.data.hatchSchedule?.bytecode ? "ok" : "danger"} label={q.data.hatchSchedule?.bytecode ? "bytecode ok" : "no bytecode"} />
              <Button size="sm" variant="ghost" onClick={() => copy(q.data.hatchSchedule.address)}><Copy className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" asChild><a href={q.data.explorer?.schedule} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
            </div>
          </div>
        </div>
      ) : <div className="text-sm text-white/50">Loading…</div>}
    </SectionCard>
  );
}

export default function ValueChain() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">ValueChain</h1>
        <p className="mt-1 text-sm text-white/60">Audit / transparency only — no fund custody, no upgradeability.</p>
      </div>
      <Contracts network="mainnet" />
      <Contracts network="testnet" />
    </div>
  );
}
