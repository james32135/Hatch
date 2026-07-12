import { useSession } from "@/hooks/useSession";
import { SectionCard } from "@/components/common/SectionCard";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { useAccount } from "wagmi";
import { shortAddr } from "@/lib/format";
import { friendlyProfile } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, HatchProfile } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const profiles: { id: HatchProfile; label: string; hint: string }[] = [
  { id: "mainnet", label: "Live network", hint: "Real markets" },
  { id: "testnet", label: "Practice network", hint: "Safe to explore" },
  { id: "mainnet-readonly", label: "Live · view only", hint: "No new investments" },
];

export default function Settings() {
  const { address } = useAccount();
  const { profile, setProfile, signOut } = useSession();
  const nav = useNavigate();
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>

      <SectionCard title="Your wallet">
        <div className="font-mono text-sm text-white/70">{address ? shortAddr(address) : "Not connected"}</div>
      </SectionCard>

      <SectionCard title="Network" subtitle="Choose where investments run. Practice is great while you learn.">
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={p.id === profile ? "default" : "secondary"}
              className={p.id === profile ? "bg-white text-black hover:bg-white/90" : "bg-white/5 hover:bg-white/10"}
              onClick={() => setProfile(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/45">Currently: {friendlyProfile(profile)}</p>
      </SectionCard>

      <ChildViewHelper />

      <SectionCard title="Your control">
        <p className="text-sm leading-relaxed text-white/60">
          You hold the keys. HATCH never takes custody of your trading account. Every investment needs your wallet
          approval.
        </p>
        <div className="mt-3">
          <AdvancedDetails label="Technical details">
            <p className="text-xs text-white/50">
              Parent-signed orders are validated and forwarded. Profile header: {profile}.
            </p>
          </AdvancedDetails>
        </div>
      </SectionCard>

      <SectionCard title="Session">
        <Button
          variant="secondary"
          className="bg-white/5 hover:bg-white/10"
          onClick={() => {
            signOut();
            nav("/");
          }}
        >
          Sign out
        </Button>
      </SectionCard>
    </div>
  );
}

function ChildViewHelper() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const children = me.data?.children || me.data?.user?.children || [];
  const mint = useMutation({
    mutationFn: (childId: string) => api.post<any>("/api/auth/child-token", { childId }),
    onSuccess: (d) => {
      const url = `${window.location.origin}/child#t=${d.token}`;
      navigator.clipboard?.writeText(url);
      toast.success("Child view link copied");
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't create link"),
  });

  return (
    <SectionCard title="Open child view" subtitle="A read-only link. They can look and learn — not invest.">
      {children.length === 0 ? (
        <p className="text-sm text-white/50">Add a child first.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {children.map((c: any) => (
            <Button
              key={c.id}
              variant="secondary"
              className="bg-white/5 hover:bg-white/10"
              disabled={mint.isPending}
              onClick={() => mint.mutate(c.id)}
            >
              Link for {c.displayName}
            </Button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
