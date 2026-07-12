import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtUsd, fmtRelative } from "@/lib/format";
import { friendlyRisk, friendlyReadiness } from "@/lib/copy";
import { useSignTypedData, useAccount } from "wagmi";
import { StatusPip } from "@/components/common/StatusPip";
import { StoryPipeline, derivePipeline } from "@/components/story/StoryPipeline";
import { ExplorerLinkCard } from "@/components/story/ExplorerLink";
import { useInfraLive } from "@/components/story/InfraStatus";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export default function ChildAllowance() {
  const { childId } = useParams();
  const qc = useQueryClient();
  const live = useInfraLive();
  const { signTypedDataAsync } = useSignTypedData();
  const { address } = useAccount();
  const [signing, setSigning] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const allowances = useQuery({ queryKey: ["allowances"], queryFn: () => api.get<any>("/api/allowances") });
  const readiness = useQuery({ queryKey: ["sodex-readiness"], queryFn: () => api.get<any>("/api/sodex/readiness") });
  const handoffs = useQuery({
    queryKey: ["allowances", "handoffs"],
    queryFn: () => api.get<any>("/api/allowances/handoffs"),
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
  });
  const lessons = useQuery({
    queryKey: ["lessons", childId],
    queryFn: () => api.get<any>(`/api/lessons/${childId}`),
    enabled: !!childId,
  });
  const policy = (allowances.data?.policies || []).find((p: any) => p.childId === childId);
  const ready = friendlyReadiness(readiness.data?.nextStep);
  const pendingForChild = (handoffs.data?.handoffs || []).some(
    (h: any) => h.childId === childId && (h.status === "pending" || !h.status),
  );
  const holdings = portfolio.data?.holdings || [];
  const lessonItems = lessons.data?.lessons || lessons.data || [];

  const pipeline = useMemo(
    () =>
      derivePipeline({
        hasPolicy: !!policy,
        policyPaused: !!policy?.paused,
        pendingHandoff: pendingForChild || celebrated,
        hasRelay: celebrated || !!lastOrderId,
        orderStatus: celebrated ? "SUBMITTED" : null,
        hasHoldingsOrTx: holdings.length > 0,
        hasLesson: lessonItems.length > 0,
        valuechainOk: live.valuechainOk,
      }),
    [policy, pendingForChild, celebrated, lastOrderId, holdings.length, lessonItems.length, live.valuechainOk],
  );

  const trigger = useMutation({
    mutationFn: () => api.post<any>(`/api/allowances/${policy?.id}/trigger`, {}),
    onSuccess: () => {
      toast.success("Ready for your approval");
      qc.invalidateQueries({ queryKey: ["allowances"] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't prepare this week's investment"),
  });

  const togglePause = useMutation({
    mutationFn: () => api.patch<any>(`/api/allowances/${policy?.id}`, { paused: !policy?.paused }),
    onSuccess: () => {
      toast.success(policy?.paused ? "Allowance resumed" : "Allowance paused");
      qc.invalidateQueries({ queryKey: ["allowances"] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't update"),
  });

  const signAndRelay = useMutation({
    mutationFn: async () => {
      const res = await api.post<any>("/api/allowances/sign-draft", { policyId: policy?.id });
      const draft = res.draft ?? res;
      const td = draft.typedData;
      if (!td?.domain || !td?.types || !td?.message) {
        throw new Error("Investment request wasn't ready. Please try again.");
      }
      if (!address) throw new Error("Connect your wallet first");
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
      const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
      const apiSign = raw.startsWith("01") && raw.length === 132 ? `0x${raw}` : `0x01${raw}`;
      const relayReq = { ...(draft.relayRequest || {}), apiSign };
      return api.post<any>("/api/sodex/relay", relayReq);
    },
    onMutate: () => setSigning(true),
    onSettled: () => setSigning(false),
    onSuccess: (data) => {
      setCelebrated(true);
      if (data?.signedOrderId) setLastOrderId(String(data.signedOrderId));
      toast.success("Investment submitted");
      qc.invalidateQueries({ queryKey: ["portfolio", childId] });
      qc.invalidateQueries({ queryKey: ["allowances"] });
    },
    onError: (e: any) => {
      const map: Record<string, string> = {
        notional_cap: "That amount is above your safety limit.",
        kill_switch: "Investing is temporarily paused. Try again shortly.",
        sig_verify_failed: "Wallet signature didn't match. Please try again.",
      };
      toast.error(map[e?.code] || e?.message || "Couldn't complete the investment");
    },
  });

  if (allowances.isLoading) return <div className="text-sm text-white/50">Loading…</div>;
  if (!policy) {
    return (
      <EmptyState
        title="No weekly allowance yet"
        detail="Create a weekly plan during onboarding so HATCH can invest automatically."
      />
    );
  }

  const notReady = readiness.data && readiness.data.nextStep !== "READY";

  return (
    <div className="space-y-4">
      <StoryPipeline
        steps={pipeline}
        title="This week's path"
        subtitle="Allowance to wallet approval to SoDEX to their growing future."
      />

      {celebrated && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-100"
        >
          <CheckCircle2 className="h-5 w-5" />
          Nice work. Their portfolio just took another step forward.
        </motion.div>
      )}

      {(celebrated || lastOrderId) && (
        <ExplorerLinkCard
          title="SoDEX order"
          status={celebrated ? "Submitted" : "Pending"}
          statusTone="ok"
          hash={lastOrderId}
          explorerUrl={live.explorer?.log}
          networkLabel={`${live.network} · SoDEX + ValueChain`}
          detail="Your wallet approved this investment. The order was relayed to SoDEX for execution."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Weekly plan">
          <div className="space-y-2.5 text-sm">
            <Row k="Amount" v={fmtUsd(policy.amountUsd)} />
            <Row k="How often" v={`Every ${policy.cadenceDays} days`} />
            <Row k="Style" v={friendlyRisk(policy.riskTier)} />
            <Row k="Next investment" v={fmtRelative(policy.nextDueAt)} />
            <Row k="Price protection" v={`Up to ${(policy.maxSlippageBps ?? 50) / 100}%`} />
            <Row k="Status" v={policy.paused ? "Paused" : "Active"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="bg-white/5 hover:bg-white/10"
              onClick={() => togglePause.mutate()}
              disabled={togglePause.isPending}
            >
              {policy.paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="secondary"
              className="bg-white/5 hover:bg-white/10"
              onClick={() => trigger.mutate()}
              disabled={trigger.isPending}
            >
              Invest this week now
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Invest now" subtitle="Confirm in your wallet. You stay in control of every investment.">
          {notReady ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs text-amber-100/90">
              Almost ready. <StatusPip tone={ready.tone} label={ready.label} className="inline-flex" /> Finish setup
              under Trading, then come back.
            </div>
          ) : (
            <ol className="space-y-2 text-sm text-white/70">
              <li>1. We prepare this week's investment for you.</li>
              <li>2. You approve it in your wallet (no network fee for this step).</li>
              <li>3. The investment is placed securely on SoDEX on your behalf.</li>
            </ol>
          )}
          <Button
            className="mt-4 bg-white text-black hover:bg-white/90"
            disabled={signAndRelay.isPending || signing || notReady}
            onClick={() => signAndRelay.mutate()}
          >
            {signAndRelay.isPending || signing ? "Waiting for your approval…" : "Approve investment"}
          </Button>

          <div className="mt-4">
            <AdvancedDetails label="How this works">
              <p className="text-xs leading-relaxed text-white/55">
                You approve a secure investment request with your own wallet. HATCH never holds your trading keys.
                Orders are checked and forwarded to SoDEX for execution, then their portfolio and lessons update.
              </p>
            </AdvancedDetails>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
      <span className="text-white/50">{k}</span>
      <span className="font-medium text-white/90">{v}</span>
    </div>
  );
}
