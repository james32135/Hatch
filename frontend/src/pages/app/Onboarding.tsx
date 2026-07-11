import { useState } from "react";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { StatusPip } from "@/components/common/StatusPip";
import { ArrowRight, ExternalLink } from "lucide-react";

const tiers = [
  { v: "CONSERVATIVE", label: "Conservative", d: "Steadier; more USSI." },
  { v: "BALANCED", label: "Balanced", d: "Half USSI, half MAG7. Recommended." },
  { v: "GROWTH", label: "Growth", d: "More MAG7. Better for older teens." },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [age, setAge] = useState<number>(10);
  const [tier, setTier] = useState("BALANCED");
  const [amount, setAmount] = useState<number>(20);
  const [childId, setChildId] = useState<string | null>(null);
  const nav = useNavigate();
  const qc = useQueryClient();

  const createChild = useMutation({
    mutationFn: () => api.post<any>("/api/children", { displayName: name, ageYears: age, riskTier: tier }),
    onSuccess: (d) => { setChildId(d?.id || d?.child?.id); qc.invalidateQueries({ queryKey: ["me"] }); setStep(2); },
    onError: (e: any) => toast.error(e?.message || "Could not create child"),
  });
  const createAllowance = useMutation({
    mutationFn: () => api.post<any>("/api/allowances", { childId, amountUsd: amount, cadenceDays: 7, riskTier: tier, maxSlippageBps: 50, paused: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["allowances"] }); setStep(3); },
    onError: (e: any) => toast.error(e?.message || "Could not create allowance"),
  });
  const readiness = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness"), enabled: step === 3 });

  const steps = ["Child", "Risk", "Allowance", "SoDEX"];
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-white" : "bg-white/15"}`} />
          </div>
        ))}
      </div>
      <h1 className="text-2xl font-medium tracking-tight">{steps[step]}</h1>

      {step === 0 && (
        <div className="mt-6 space-y-4">
          <div><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" className="mt-2 bg-white/[0.03]" /></div>
          <div><Label>Age (5–17)</Label><Input type="number" min={5} max={17} value={age} onChange={(e) => setAge(Number(e.target.value))} className="mt-2 bg-white/[0.03]" /></div>
          <Button className="bg-white text-black hover:bg-white/90" disabled={!name || age < 5 || age > 17} onClick={() => setStep(1)}>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <RadioGroup value={tier} onValueChange={setTier} className="space-y-2">
            {tiers.map((t) => (
              <label key={t.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${tier === t.v ? "border-white/40 bg-white/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
                <RadioGroupItem value={t.v} className="mt-1" />
                <div><div className="font-medium">{t.label}</div><div className="text-sm text-white/60">{t.d}</div></div>
              </label>
            ))}
          </RadioGroup>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button className="bg-white text-black hover:bg-white/90" onClick={() => createChild.mutate()} disabled={createChild.isPending}>Create child</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div><Label>Weekly allowance (USD)</Label><Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-2 bg-white/[0.03]" /></div>
          <p className="text-xs text-white/50">Backend enforces a max notional cap. Start small; increase later.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button className="bg-white text-black hover:bg-white/90" onClick={() => createAllowance.mutate()} disabled={createAllowance.isPending}>Save allowance</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between">
              <div className="font-medium">SoDEX Vault</div>
              <StatusPip tone={readiness.data?.nextStep === "READY" ? "ok" : "warn"} label={readiness.data?.nextStep || "checking…"} />
            </div>
            <p className="mt-2 text-sm text-white/60">You'll trade through your own SoDEX account. HATCH never holds your trading keys.</p>
            {readiness.data?.appUrl && readiness.data?.nextStep !== "READY" && (
              <a href={readiness.data.appUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-white/80 underline">
                Open SoDEX to enable trading <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => nav("/app")}>Skip for now</Button>
            <Button className="bg-white text-black hover:bg-white/90" onClick={() => nav("/app")}>Go to dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
