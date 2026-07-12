import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { AdvancedDetails } from "@/components/common/AdvancedDetails";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtUsd, fmtRelative, fmtDate, shortAddr } from "@/lib/format";
import { friendlyRisk, friendlyReadiness } from "@/lib/copy";
import { useSignTypedData, useAccount } from "wagmi";
import { StatusPip } from "@/components/common/StatusPip";
import { StoryPipeline, derivePipeline } from "@/components/story/StoryPipeline";
import { ExplorerLinkCard } from "@/components/story/ExplorerLink";
import { useInfraLive } from "@/components/story/InfraStatus";
import { useState, useMemo } from "react";
import { ExternalLink } from "lucide-react";

export default function ChildAllowance() {
  const { childId } = useParams();
  const qc = useQueryClient();
  const live = useInfraLive();
  const { signTypedDataAsync } = useSignTypedData();
  const { address } = useAccount();
  const [signing, setSigning] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);

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
    refetchInterval: lastOrderId ? 8_000 : false,
  });
  const lessons = useQuery({
    queryKey: ["lessons", childId],
    queryFn: () => api.get<any>(`/api/lessons/${childId}`),
    enabled: !!childId,
  });
  const verification = useQuery({
    queryKey: ["order-verification", lastOrderId],
    queryFn: () => api.get<any>(`/api/sodex/orders/${lastOrderId}/verification`),
    enabled: !!lastOrderId,
    refetchInterval: (q) => {
      const v = q.state.data?.verification;
      if (!v) return 2_000;
      if (v.waitingForMatch || v.hatchStatus === "SUBMITTED" || v.executionStatus === "WAITING_FOR_MATCH") {
        return 2_000;
      }
      if (v.hatchStatus === "FILLED" || v.sodexStatus === "FILLED") return false;
      if (["REJECTED", "FAILED"].includes(String(v.hatchStatus))) return false;
      return 4_000;
    },
  });

  const policy = (allowances.data?.policies || []).find((p: any) => p.childId === childId);
  const ready = friendlyReadiness(readiness.data?.nextStep);
  const pendingForChild = (handoffs.data?.handoffs || []).some(
    (h: any) => h.childId === childId && (h.status === "pending" || !h.status),
  );
  const holdings = portfolio.data?.holdings || [];
  const lessonItems = lessons.data?.lessons || lessons.data || [];
  const v = verification.data?.verification;
  const orderStatus = v?.hatchStatus || v?.executionStatus || (lastOrderId ? "SUBMITTED" : null);
  const filled = String(orderStatus).toUpperCase() === "FILLED" || v?.sodexStatus === "FILLED";

  const pipeline = useMemo(
    () =>
      derivePipeline({
        hasPolicy: !!policy,
        policyPaused: !!policy?.paused,
        pendingHandoff: pendingForChild || signing,
        hasRelay: !!lastOrderId,
        orderStatus,
        sodexStatus: v?.sodexStatus,
        waitingForMatch: !!v?.waitingForMatch && !filled,
        hasHoldingsOrTx: holdings.length > 0 && filled,
        hasLesson: lessonItems.length > 0 && filled,
        valuechainOk: live.valuechainOk && filled,
      }),
    [
      policy,
      pendingForChild,
      signing,
      lastOrderId,
      orderStatus,
      v?.sodexStatus,
      v?.waitingForMatch,
      filled,
      holdings.length,
      lessonItems.length,
      live.valuechainOk,
    ],
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
      setPhase("Preparing");
      const res = await api.post<any>("/api/allowances/sign-draft", { policyId: policy?.id });
      const draft = res.draft ?? res;
      const td = draft.typedData;
      if (!td?.domain || !td?.types || !td?.message) {
        throw new Error("Investment request wasn't ready. Please try again.");
      }
      if (!address) throw new Error("Connect your wallet first");
      setPhase("Wallet Signature");
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
      setPhase("Relay Accepted");
      return api.post<any>("/api/sodex/relay", relayReq);
    },
    onMutate: () => setSigning(true),
    onSettled: () => {
      setSigning(false);
      setPhase(null);
    },
    onSuccess: (data) => {
      if (data?.signedOrderId) setLastOrderId(String(data.signedOrderId));
      const st = String(data?.hatchStatus || "");
      const ver = data?.verification;
      if (st === "FILLED" || ver?.sodexStatus === "FILLED") {
        toast.success("Order filled on SoDEX");
      } else if (st === "SUBMITTED" || data?.relayAccepted) {
        toast.message("Relay accepted — waiting for SoDEX fill confirmation");
      } else {
        toast.error(data?.note || "Order was not accepted by SoDEX");
      }
      qc.invalidateQueries({ queryKey: ["portfolio", childId] });
      qc.invalidateQueries({ queryKey: ["allowances"] });
      qc.invalidateQueries({ queryKey: ["order-verification"] });
    },
    onError: (e: any) => {
      const map: Record<string, string> = {
        notional_cap: "That amount is above your safety limit.",
        notional_too_small:
          e?.message || "SoDEX minNotional is $5 for MAG7/USSI. Raise the weekly allowance.",
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
  const statusLabel = filled
    ? "Filled"
    : v?.waitingForMatch
      ? "Waiting for matching"
      : v?.hatchStatus === "REJECTED" || v?.hatchStatus === "FAILED"
        ? String(v.hatchStatus)
        : lastOrderId
          ? String(v?.executionStatus || v?.hatchStatus || "Submitted")
          : null;

  return (
    <div className="space-y-4">
      <StoryPipeline
        steps={pipeline}
        title="This week's path"
        subtitle="Every step comes from SoDEX order history, trades, and balances — never assumed."
      />

      {lastOrderId && (
        <ExplorerLinkCard
          title="SoDEX order"
          status={statusLabel || "Pending"}
          statusTone={filled ? "ok" : v?.hatchStatus === "REJECTED" ? "danger" : "warn"}
          hash={v?.sodexOrderId || lastOrderId}
          explorerUrl={live.explorer?.log}
          networkLabel={`${live.network} · SoDEX + ValueChain`}
          detail={
            filled
              ? "SoDEX confirmed FILLED. Portfolio refresh uses live balances and trades."
              : v?.waitingForMatch
                ? "Relay accepted. Waiting for matching — UI will not show Filled until SoDEX order history confirms it."
                : v?.mismatches?.length
                  ? v.mismatches.join(" · ")
                  : "Tracking live SoDEX execution status."
          }
        />
      )}

      {lastOrderId && (
        <SectionCard title="Verification" subtitle="Hard cross-check against official SoDEX APIs">
          {!v && verification.isLoading ? (
            <div className="text-sm text-white/50">Reading SoDEX order history and trades…</div>
          ) : (
            <div className="space-y-2 text-sm">
              <Row k="Wallet" v={address ? shortAddr(address) : "-"} />
              <Row k="Order ID" v={v?.sodexOrderId ? String(v.sodexOrderId) : "Synchronization Pending"} />
              <Row k="Client order" v={v?.clOrdId ? shortAddr(v.clOrdId) : shortAddr(lastOrderId)} />
              <Row
                k="Trade ID"
                v={v?.tradeIds?.length ? v.tradeIds.map(String).join(", ") : "Synchronization Pending"}
              />
              <Row k="Execution status" v={String(v?.executionStatus || v?.hatchStatus || "UNKNOWN")} />
              <Row k="Filled quantity" v={v?.filledQty != null ? String(v.filledQty) : "Synchronization Pending"} />
              <Row k="Filled price" v={v?.filledPrice != null ? String(v.filledPrice) : "Synchronization Pending"} />
              <Row k="Settlement time" v={v?.lastSyncAt ? fmtDate(v.lastSyncAt) : "-"} />
              <Row k="Last sync" v={v?.lastSyncAt ? fmtDate(v.lastSyncAt) : "-"} />
              <Row k="SSI sync status" v="Path A = SoDEX vault tokens (not Base SSI site auto-update)" />
              <Row k="Backend time" v={verification.data?.backendTime ? fmtDate(verification.data.backendTime) : "-"} />
              <div className="flex flex-wrap gap-3 pt-2 text-xs">
                {v?.sodexAppUrl && (
                  <a
                    href={v.sodexAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
                  >
                    SoDEX <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {live.explorer?.log && (
                  <a
                    href={live.explorer.log}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
                  >
                    ValueChain explorer <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {!!v?.mismatches?.length && (
                <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs text-amber-100/90">
                  <div className="mb-1 font-medium">Exact mismatches</div>
                  <ul className="list-disc space-y-1 pl-4">
                    {v.mismatches.map((m: string, i: number) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {v?.protocolNote && <p className="pt-2 text-xs text-white/40">{v.protocolNote}</p>}
            </div>
          )}
        </SectionCard>
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
          {Number(policy.amountUsd) < 5 && (
            <p className="mt-3 text-xs text-amber-200/80">
              SoDEX requires minNotional $5 for MAG7/USSI. Raise this weekly amount to at least $5 before approving.
            </p>
          )}
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
              <li>1. We prepare this week's investment from live SoDEX symbols and mids.</li>
              <li>2. You approve it in your wallet (no network fee for this step).</li>
              <li>3. SoDEX accepts the order, then we poll order history until FILLED.</li>
            </ol>
          )}
          {phase && <p className="mt-2 text-xs text-sky-200/80">{phase}…</p>}
          <Button
            className="mt-4 bg-white text-black hover:bg-white/90"
            disabled={
              signAndRelay.isPending ||
              signing ||
              notReady ||
              Number(policy.amountUsd) < 5 ||
              (lastOrderId && v?.waitingForMatch)
            }
            onClick={() => signAndRelay.mutate()}
          >
            {signAndRelay.isPending || signing
              ? "Waiting for your approval…"
              : v?.waitingForMatch
                ? "Waiting for SoDEX fill…"
                : "Approve investment"}
          </Button>

          <div className="mt-4">
            <AdvancedDetails label="How this works">
              <p className="text-xs leading-relaxed text-white/55">
                You approve a secure investment request with your own wallet. HATCH never holds your trading keys.
                After relay, fill is confirmed only via SoDEX order history and user trades. Path A updates SoDEX vault
                balances (vMAG7.ssi / vUSSI) — not the Base SSI website automatically.
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
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="shrink-0 text-white/50">{k}</span>
      <span className="break-all text-right font-medium text-white/90">{v}</span>
    </div>
  );
}
