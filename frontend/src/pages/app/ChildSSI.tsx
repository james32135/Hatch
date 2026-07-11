import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

export default function ChildSSI() {
  const { childId } = useParams();
  const caps = useQuery({ queryKey: ["ssi-caps"], queryFn: () => api.get<any>("/api/ssi/capabilities", { auth: false }) });
  const { address } = useAccount();
  const balances = useQuery({ queryKey: ["ssi-bal", address], queryFn: () => api.get<any>(`/api/ssi/balances/${address}`, { auth: false }), enabled: !!address });
  const mintFlow = useQuery({ queryKey: ["ssi-mint", "MAG7"], queryFn: () => api.get<any>("/api/ssi/flows/mint?index=MAG7", { auth: false }) });
  const stakeFlow = useQuery({ queryKey: ["ssi-stake"], queryFn: () => api.get<any>("/api/ssi/flows/stake", { auth: false }) });
  const sync = useMutation({
    mutationFn: () => {
      if (!childId) throw new Error("childId required");
      return api.post<any>("/api/ssi/sync/portfolio", { childId });
    },
    onSuccess: () => toast.success("Sync queued"),
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const mintSteps: any[] =
    mintFlow.data?.pathA?.steps ||
    mintFlow.data?.mint?.steps ||
    mintFlow.data?.steps ||
    [];
  const earnUrl =
    stakeFlow.data?.plan?.earnUrl ||
    stakeFlow.data?.earnUrl ||
    "https://ssi.sosovalue.com";

  return (
    <div className="space-y-4">
      <SectionCard title="Capabilities">
        {caps.data && (
          <div className="space-y-2 text-sm">
            <Row k="Path A — SoDEX Vault" tone={caps.data.pathA_sodexVault?.mint ? "ok" : "warn"} v={caps.data.pathA_sodexVault?.mint ? "Available" : "Unavailable"} />
            <Row k="Path B — Base mint" tone={caps.data.pathB_baseMint?.available ? "ok" : "warn"} v={caps.data.pathB_baseMint?.available ? "Available" : (caps.data.pathB_baseMint?.blockedReason || "Blocked")} />
            <Row k="Stake" tone="info" v={caps.data.stake?.mode || "—"} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Mint MAG7 (Path A steps)">
        {mintSteps.length ? (
          <ol className="space-y-2 text-sm">
            {mintSteps.map((s: any, i: number) => (
              <li key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/50">Step {i + 1}</div>
                <div className="mt-1 text-white/80">{typeof s === "string" ? s : (s.description || s.name || JSON.stringify(s))}</div>
              </li>
            ))}
          </ol>
        ) : <div className="text-sm text-white/50">No plan returned.</div>}
      </SectionCard>

      <SectionCard title="Stake — SSI Earn (official)">
        <p className="text-sm text-white/60 mb-3">Staking happens on the official SSI Earn app. HATCH does not custody staked assets.</p>
        <Button asChild className="bg-white text-black hover:bg-white/90"><a href={earnUrl} target="_blank" rel="noreferrer">Continue on SSI Earn <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a></Button>
      </SectionCard>

      <SectionCard title="Base balances" action={<Button size="sm" variant="ghost" className="text-white/70" onClick={() => sync.mutate()} disabled={sync.isPending || !childId}>Sync</Button>}>
        {!address ? <div className="text-sm text-white/50">Connect wallet to view.</div> :
          balances.isLoading ? <div className="text-sm text-white/50">Loading…</div> :
            <pre className="overflow-x-auto rounded bg-white/[0.02] p-3 font-mono text-[11px] text-white/70">{JSON.stringify(balances.data, null, 2)}</pre>}
      </SectionCard>
    </div>
  );
}

function Row({ k, tone, v }: { k: string; tone: "ok" | "warn" | "danger" | "info"; v: string }) {
  return <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"><span>{k}</span><StatusPip tone={tone} label={v} /></div>;
}
