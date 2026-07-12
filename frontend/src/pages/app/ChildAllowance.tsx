import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Unavailable } from "@/components/common/Unavailable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtUsd, fmtRelative } from "@/lib/format";
import { useSignTypedData, useAccount } from "wagmi";
import { StatusPip } from "@/components/common/StatusPip";
import { useState } from "react";

export default function ChildAllowance() {
  const { childId } = useParams();
  const qc = useQueryClient();
  const { signTypedDataAsync } = useSignTypedData();
  const { address } = useAccount();
  const [signing, setSigning] = useState(false);

  const allowances = useQuery({ queryKey: ["allowances"], queryFn: () => api.get<any>("/api/allowances") });
  const readiness = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const policy = (allowances.data?.policies || []).find((p: any) => p.childId === childId);

  const trigger = useMutation({
    mutationFn: () => api.post<any>(`/api/allowances/${policy?.id}/trigger`, {}),
    onSuccess: () => { toast.success("Handoff created"); qc.invalidateQueries({ queryKey: ["allowances"] }); },
    onError: (e: any) => toast.error(e?.message || "Trigger failed"),
  });

  const togglePause = useMutation({
    mutationFn: () => api.patch<any>(`/api/allowances/${policy?.id}`, { paused: !policy?.paused }),
    onSuccess: () => { toast.success("Policy updated"); qc.invalidateQueries({ queryKey: ["allowances"] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const signAndRelay = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/api/allowances/sign-draft", { policyId: policy?.id });
      const draft = res.draft ?? res;
      const td = draft.typedData;
      if (!td?.domain || !td?.types || !td?.message) {
        throw new Error("Sign-draft missing typedData — backend response unexpected");
      }
      if (!address) throw new Error("Connect wallet first");
      // Backend sends nonce as decimal string; EIP-712 uint64 requires bigint
      const signature = await signTypedDataAsync({
        account: address,
        domain: td.domain,
        types: td.types,
        primaryType: td.primaryType || "ExchangeAction",
        message: {
          ...td.message,
          nonce: BigInt(td.message.nonce),
        },
      });
      // SoDEX requires 0x01 type-byte prefix on X-API-Sign
      const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
      const apiSign = raw.startsWith("01") && raw.length === 132 ? `0x${raw}` : `0x01${raw}`;
      const relayReq = { ...(draft.relayRequest || {}), apiSign };
      return api.post<any>("/api/sodex/relay", relayReq);
    },
    onMutate: () => setSigning(true),
    onSettled: () => setSigning(false),
    onSuccess: () => {
      toast.success("Order submitted");
      qc.invalidateQueries({ queryKey: ["portfolio", childId] });
      qc.invalidateQueries({ queryKey: ["allowances"] });
    },
    onError: (e: any) => {
      const map: Record<string, string> = {
        notional_cap: "Amount exceeds notional cap.",
        kill_switch: "Trading is temporarily paused by the operator.",
        sig_verify_failed: "Signature verification failed.",
      };
      toast.error(map[e?.code] || e?.message || "Relay failed");
    },
  });

  if (allowances.isLoading) return <div className="text-sm text-white/50">Loading…</div>;
  if (!policy) return <Unavailable title="No allowance policy" detail="Create one from onboarding." />;

  const notReady = readiness.data && readiness.data.nextStep !== "READY";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Policy">
        <div className="space-y-2 text-sm">
          <Row k="Amount" v={fmtUsd(policy.amountUsd)} />
          <Row k="Cadence" v={`Every ${policy.cadenceDays} days`} />
          <Row k="Risk tier" v={policy.riskTier} />
          <Row k="Next due" v={fmtRelative(policy.nextDueAt)} />
          <Row k="Slippage" v={`${(policy.maxSlippageBps ?? 50) / 100}%`} />
          <Row k="Status" v={policy.paused ? "Paused" : "Active"} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => togglePause.mutate()}>{policy.paused ? "Resume" : "Pause"}</Button>
          <Button variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => trigger.mutate()} disabled={trigger.isPending}>Trigger handoff now</Button>
        </div>
      </SectionCard>

      <SectionCard title="Invest now" subtitle="Sign an EIP-712 order in your wallet. Backend validates & relays.">
        {notReady ? (
          <div className="rounded-lg border border-[hsl(38_92%_55%/0.3)] bg-[hsl(38_92%_55%/0.06)] p-3 text-xs text-[hsl(38_92%_75%)]">
            SoDEX not ready — status <StatusPip tone="warn" label={readiness.data?.nextStep} className="inline-flex" />. Enable trading first.
          </div>
        ) : (
          <ol className="space-y-2 text-sm text-white/70">
            <li>1. Backend produces an unsigned EIP-712 draft.</li>
            <li>2. You sign in your wallet (no gas).</li>
            <li>3. Backend relays to SoDEX Vault.</li>
          </ol>
        )}
        <Button className="mt-4 bg-white text-black hover:bg-white/90" disabled={signAndRelay.isPending || signing || notReady} onClick={() => signAndRelay.mutate()}>
          {signAndRelay.isPending ? "Signing & relaying…" : "Sign & relay"}
        </Button>
      </SectionCard>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between border-b border-white/5 pb-2 last:border-none last:pb-0"><span className="text-white/50">{k}</span><span className="font-mono text-white">{v}</span></div>;
}
