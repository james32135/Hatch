import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusPip } from "@/components/common/StatusPip";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { ExternalLink, TrendingUp, Landmark, GraduationCap } from "lucide-react";

export default function ChildSSI() {
  const { childId } = useParams();
  const caps = useQuery({ queryKey: ["ssi-caps"], queryFn: () => api.get<any>("/api/ssi/capabilities", { auth: false }) });
  const { address } = useAccount();
  const balances = useQuery({
    queryKey: ["ssi-bal", address],
    queryFn: () => api.get<any>(`/api/ssi/balances/${address}`, { auth: false }),
    enabled: !!address,
  });
  const mintFlow = useQuery({
    queryKey: ["ssi-mint", "MAG7"],
    queryFn: () => api.get<any>("/api/ssi/flows/mint?index=MAG7", { auth: false }),
  });
  const stakeFlow = useQuery({
    queryKey: ["ssi-stake"],
    queryFn: () => api.get<any>("/api/ssi/flows/stake", { auth: false }),
  });
  const sync = useMutation({
    mutationFn: () => {
      if (!childId) throw new Error("childId required");
      return api.post<any>("/api/ssi/sync/portfolio", { childId });
    },
    onSuccess: () => toast.success("Refreshing family spot account"),
    onError: (e: any) => toast.error(e?.message || "Couldn't refresh"),
  });

  const mintSteps: any[] =
    mintFlow.data?.pathA?.steps || mintFlow.data?.mint?.steps || mintFlow.data?.steps || [];
  const earnUrl =
    stakeFlow.data?.plan?.earnUrl || stakeFlow.data?.earnUrl || "https://ssi.sosovalue.com";

  const friendlySteps = mintSteps.map((s: any, i: number) => {
    const text = typeof s === "string" ? s : s.description || s.name || "";
    const map: Record<number, string> = {
      0: "Make sure trading is enabled on your account",
      1: "Add cash so the weekly allowance can invest",
      2: "Approve the investment from their allowance page",
      3: "Confirm in your wallet when prompted",
      4: "Watch the parent-owned family spot account update",
    };
    return map[i] || text.replace(/POST \/api\/\S+/g, "approve in the app").replace(/EIP-712/gi, "wallet approval").replace(/vUSDC/g, "cash").replace(/vMAG7ssi_vUSDC/g, "MAG7 index");
  });

  return (
    <div className="space-y-4">
      <SectionCard title="How investing works">
        <div className="grid gap-3 sm:grid-cols-3">
          <Feature
            icon={TrendingUp}
            title="Invest"
            detail="A child-specific allowance plan directs parent-approved purchases into the shared family account."
          />
          <Feature icon={Landmark} title="Earn" detail="Optional staking happens on the official SSI Earn experience." />
          <Feature icon={GraduationCap} title="Learn" detail="Short lessons explain what changed in plain language." />
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <span>Automatic weekly investing</span>
            <StatusPip tone={caps.data?.pathA_sodexVault?.mint ? "ok" : "warn"} label={caps.data?.pathA_sodexVault?.mint ? "Available" : "Unavailable"} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
            <span>Direct on-chain minting</span>
            <StatusPip tone="info" label="For institutions only" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Getting started">
        {friendlySteps.length ? (
          <ol className="space-y-2 text-sm">
            {friendlySteps.map((s: string, i: number) => (
              <li key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="text-[11px] uppercase tracking-wider text-white/40">Step {i + 1}</div>
                <div className="mt-1 text-white/85">{s}</div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-sm text-white/50">Open Allowance to make their first investment.</div>
        )}
      </SectionCard>

      <SectionCard title="Stake & earn">
        <p className="mb-3 text-sm text-white/60">
          Staking is handled on the official SSI Earn site. HATCH never takes custody of staked assets.
        </p>
        <Button asChild className="bg-white text-black hover:bg-white/90">
          <a href={earnUrl} target="_blank" rel="noreferrer">
            Continue on SSI Earn <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      </SectionCard>

      <SectionCard
        title="Connected parent wallet balances"
        action={
          <Button size="sm" variant="ghost" className="text-white/70" onClick={() => sync.mutate()} disabled={sync.isPending || !childId}>
            Refresh
          </Button>
        }
      >
        <p className="mb-3 text-xs leading-relaxed text-white/45">
          These are wallet-level balances owned by the connected parent. They are not allocated child holdings.
        </p>
        {!address ? (
          <div className="text-sm text-white/50">Connect your wallet to view Base balances.</div>
        ) : balances.isLoading ? (
          <div className="text-sm text-white/50">Loading…</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {Object.entries(balances.data?.balances || {}).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                <div className="text-xs text-white/45">{friendlyToken(k)}</div>
                <div className="mt-0.5 font-mono text-white/90">{String(v)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <AdvancedDetails label="Technical details">
            <pre className="overflow-x-auto text-[11px] text-white/50">{JSON.stringify(balances.data?.tokens || caps.data?.protocol || {}, null, 2)}</pre>
          </AdvancedDetails>
        </div>
      </SectionCard>
    </div>
  );
}

function Feature({ icon: Icon, title, detail }: { icon: any; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <Icon className="mb-2 h-4 w-4 text-sky-300/80" strokeWidth={1.5} />
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-white/55">{detail}</p>
    </div>
  );
}

function friendlyToken(k: string) {
  const map: Record<string, string> = {
    mag7Ssi: "MAG7 index",
    ussi: "USSI index",
    sMag7Ssi: "Staked MAG7",
    defiSsi: "DEFI index",
    memeSsi: "MEME index",
  };
  return map[k] || k;
}
