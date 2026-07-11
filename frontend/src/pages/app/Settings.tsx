import { useSession } from "@/hooks/useSession";
import { SectionCard } from "@/components/common/SectionCard";
import { useAccount } from "wagmi";
import { shortAddr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { HatchProfile } from "@/lib/api";

const profiles: HatchProfile[] = ["mainnet", "testnet", "mainnet-readonly"];

export default function Settings() {
  const { address } = useAccount();
  const { profile, setProfile, signOut } = useSession();
  const nav = useNavigate();
  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>

      <SectionCard title="Wallet">
        <div className="font-mono text-sm text-white/70">{address ? shortAddr(address) : "—"}</div>
      </SectionCard>

      <SectionCard title="Network profile" subtitle="Sent as X-HATCH-Profile on every request.">
        <div className="flex gap-2">
          {profiles.map((p) => (
            <Button key={p} size="sm" variant={p === profile ? "default" : "secondary"} className={p === profile ? "bg-white text-black hover:bg-white/90" : "bg-white/5 hover:bg-white/10"} onClick={() => setProfile(p)}>{p}</Button>
          ))}
        </div>
      </SectionCard>

      <ChildViewHelper />

      <SectionCard title="Custody">
        <p className="text-sm text-white/60">You hold the keys. HATCH never takes custody of your SoDEX account. All trades are parent-signed EIP-712 orders relayed to SoDEX Vault.</p>
      </SectionCard>

      <SectionCard title="Session">
        <Button variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => { signOut(); nav("/"); }}>Sign out</Button>
      </SectionCard>
    </div>
  );
}

function ChildViewHelper() {
  const mint = useMutation({
    mutationFn: (childId: string) => api.post<any>("/api/auth/child-token", { childId }),
    onSuccess: (d) => { const url = `${window.location.origin}/child#t=${d.token}`; navigator.clipboard?.writeText(url); toast.success("Child link copied"); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  return (
    <SectionCard title="Open child view">
      <p className="mb-3 text-sm text-white/60">Copy a signed link for your child. Read-only. Cannot sign or mutate.</p>
      <Button variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => {
        const id = window.prompt("Child ID?");
        if (id) mint.mutate(id);
      }}>Mint child link</Button>
    </SectionCard>
  );
}
