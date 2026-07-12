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
import { Check, ExternalLink } from "lucide-react";
import { toSodexWireApiSign } from "@/lib/sodexSign";

function displayBase(symbol: string, base?: string) {
  const b = (base || symbol.split("_")[0] || symbol).replace(/^v/i, "");
  return b.replace(/ssi$/i, "").toUpperCase() || symbol;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-white/45">{k}</span>
      <span className="text-right text-white/85">{v}</span>
    </div>
  );
}

export default function ChildAllowance() {
  const { childId } = useParams();
  const qc = useQueryClient();
  const live = useInfraLive();
  const { signTypedDataAsync } = useSignTypedData();
  const { address } = useAccount();
  const [lastRoute, setLastRoute] = useState<any>(null);
  const [signing, setSigning] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const allowances = useQuery({
    queryKey: ["allowances"],
    queryFn: () => api.get<any>("/api/allowances"),
  });
  const readiness = useQuery({
    queryKey: ["sodex-readiness"],
    queryFn: () => api.get<any>("/api/sodex/readiness"),
  });
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

  const policy = (allowances.data?.policies || []).find((p: any) => p.childId === childId);
  const notional = Number(policy?.amountUsd || 0);

  const discovery = useQuery({
    queryKey: ["eligible-markets", notional, live.network],
    queryFn: () =>
      api.get<any>(`/api/sodex/markets/executable?notionalUsd=${encodeURIComponent(String(notional || 5))}`, {
        auth: false,
      }),
    enabled: !!policy,
    refetchInterval: 30_000,
  });

  // Never allow selecting a market that failed eligibility
  const available = (discovery.data?.available || discovery.data?.report?.available || []).filter(
    (m: any) =>
      m.executable !== false &&
      m.matcherCapable !== false &&
      m.gatewayValidation !== "FAIL" &&
      m.gatewayValidation !== "CANCEL_ONLY" &&
      m.gatewayValidation !== "UNVERIFIED",
  );
  const unavailable = discovery.data?.unavailable || discovery.data?.report?.unavailable || [];
  const verification = useQuery({
    queryKey: ["order-verification", lastOrderId],
    queryFn: () => api.get<any>(`/api/sodex/orders/${lastOrderId}/verification`),
    enabled: !!lastOrderId,
    refetchInterval: (q) => {
      const v = q.state.data?.verification;
      if (!v) return 2_000;
      const sodex = String(v.sodexStatus || "").toUpperCase();
      const hatch = String(v.hatchStatus || "").toUpperCase();
      if (["FILLED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED", "FAILED"].includes(sodex)) {
        if (v.fillEvidence?.fillProven || ["CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(sodex)) {
          return false;
        }
      }
      if (["FILLED", "REJECTED", "FAILED"].includes(hatch) && !v.waitingForMatch) return false;
      if (v.waitingForMatch || hatch === "SUBMITTED" || v.executionStatus === "WAITING_FOR_MATCH") {
        return 2_000;
      }
      return 4_000;
    },
  });

  const ready = friendlyReadiness(readiness.data?.nextStep);
  const pendingForChild = (handoffs.data?.handoffs || []).some(
    (h: any) => h.childId === childId && (h.status === "pending" || !h.status),
  );
  const holdings = portfolio.data?.holdings || [];
  const lessonItems = lessons.data?.lessons || lessons.data || [];
  const v = verification.data?.verification;
  const orderStatus = v?.hatchStatus || v?.executionStatus || (lastOrderId ? "SUBMITTED" : null);

  const filled =
    !!v?.fillEvidence?.fillProven &&
    Number(v?.filledQty || 0) > 0 &&
    Array.isArray(v?.tradeIds) &&
    v.tradeIds.length > 0;

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
      if (!selectedSymbol) throw new Error("Pick an available market first");
      setPhase("Scanning markets");
      const res = await api.post<any>("/api/allowances/sign-draft", {
        policyId: policy?.id,
        symbol: selectedSymbol,
      });
      const draft = res.draft ?? res;
      setLastRoute(res.route || draft.route || null);
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
      const apiSign = toSodexWireApiSign(signature);
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
      if (ver?.fillEvidence?.fillProven || st === "FILLED") {
        toast.success("Order filled on SoDEX");
      } else if (st === "SUBMITTED" || data?.relayAccepted) {
        toast.message("Relay accepted — verifying via SoDEX history, trades, and balances");
      } else {
        toast.error(data?.note || data?.sodexError || "Order was not accepted by SoDEX");
      }
      qc.invalidateQueries({ queryKey: ["portfolio", childId] });
      qc.invalidateQueries({ queryKey: ["portfolio-hist", childId] });
      qc.invalidateQueries({ queryKey: ["portfolio-tx", childId] });
      qc.invalidateQueries({ queryKey: ["lessons", childId] });
      qc.invalidateQueries({ queryKey: ["allowances"] });
      qc.invalidateQueries({ queryKey: ["order-verification"] });
      qc.invalidateQueries({ queryKey: ["market-discovery"] });
      qc.invalidateQueries({ queryKey: ["eligible-markets"] });
      // Keep polling portfolio so child/overview sync without manual refresh
      void qc.refetchQueries({ queryKey: ["portfolio", childId] });
    },
    onError: (e: any) => {
      const map: Record<string, string> = {
        notional_cap: "That amount is above your safety limit.",
        notional_too_small: e?.message || "Raise the weekly allowance to meet SoDEX minNotional.",
        no_executable_liquidity:
          e?.message || "No SoDEX market has enough ask liquidity right now.",
        market_not_executable: e?.message || "That market is no longer executable. Pick another.",
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
  const canceled =
    ["CANCELED", "CANCELLED", "EXPIRED", "REJECTED"].includes(String(v?.sodexStatus || "").toUpperCase()) ||
    ["REJECTED", "FAILED"].includes(String(v?.hatchStatus || "").toUpperCase());
  const statusLabel = filled
    ? "Filled"
    : canceled
      ? String(v?.sodexStatus || v?.hatchStatus || "Not filled")
      : v?.waitingForMatch
        ? "Waiting for matching"
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

      <SectionCard
        title="Markets you can actually buy right now"
        subtitle="Signed matcher capability required — dry reads alone never qualify."
      >
        {discovery.isLoading ? (
          <p className="text-sm text-white/45">Running eligibility scan on every SoDEX market…</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-amber-100/80">
            No eligible markets for {fmtUsd(notional)} right now. See unavailable reasons below.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {available.map((m: any) => {
              const on = selectedSymbol === m.symbol;
              const verified = m.lastVerified
                ? new Date(m.lastVerified).toLocaleTimeString()
                : "—";
              return (
                <button
                  key={m.symbol}
                  type="button"
                  onClick={() => setSelectedSymbol(m.symbol)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    on
                      ? "border-emerald-400/40 bg-emerald-400/[0.08]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-semibold text-white/70">
                        {displayBase(m.symbol, m.base).slice(0, 3)}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-white">
                          {displayBase(m.symbol, m.base)}
                        </div>
                        <div className="text-[10px] text-white/35">{m.symbol}</div>
                      </div>
                    </div>
                    {on ? (
                      <Check className="h-4 w-4 text-emerald-300" />
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">
                        Matcher OK
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-white/55">
                    <span>
                      Trading Enabled{" "}
                      <span className="text-emerald-300/90">{m.tradingEnabled !== false ? "YES" : "NO"}</span>
                    </span>
                    <span>
                      Cancel Only{" "}
                      <span className="text-white/80">{m.cancelOnly ? "YES" : "NO"}</span>
                    </span>
                    <span>
                      Maintenance{" "}
                      <span className="text-white/80">{m.maintenance ? "YES" : "NO"}</span>
                    </span>
                    <span>
                      Capability{" "}
                      <span
                        className={
                          m.gatewayValidation === "MATCHER_OK" || m.gatewayValidation === "FILL_OK"
                            ? "text-emerald-300/90"
                            : "text-amber-200/80"
                        }
                      >
                        {m.gatewayValidation || "UNVERIFIED"}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-white/45">
                    <span>Depth {fmtUsd(m.askDepthUsd)}</span>
                    <span>
                      Spread{" "}
                      {m.spreadPct != null ? `${(m.spreadPct * 100).toFixed(2)}%` : "—"}
                    </span>
                    <span>Fill ~{Math.round((m.estimatedFillProbability || 0) * 100)}%</span>
                    <span>Ask {m.bestAsk ?? "—"}</span>
                  </div>
                  <p className="mt-2 text-[10px] text-white/30">Last verified {verified}</p>
                </button>
              );
            })}
          </div>
        )}

        {unavailable.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-white/35">
              Unavailable today
            </h4>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.06] p-2">
              {unavailable.slice(0, 40).map((m: any) => (
                <div
                  key={m.symbol}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-xs text-white/45"
                >
                  <span className="truncate">
                    {displayBase(m.symbol, m.base)}{" "}
                    <span className="text-white/25">{m.symbol}</span>
                  </span>
                  <span className="shrink-0 text-amber-200/70">{m.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {lastRoute && (
        <SectionCard title="Execution route" subtitle="Live discovery evidence for this invest">
          <div className="space-y-2.5 text-sm">
            <Row k="Market" v={String(lastRoute.symbol)} />
            <Row k="Best ask" v={lastRoute.bestAsk != null ? String(lastRoute.bestAsk) : "-"} />
            <Row k="Ask depth (USD)" v={lastRoute.askDepthUsd != null ? fmtUsd(lastRoute.askDepthUsd) : "-"} />
            <Row k="Score" v={String(lastRoute.score ?? "-")} />
            <Row k="Slippage cap" v={`${(lastRoute.maxSlippageBps ?? 50) / 100}%`} />
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-white/55">
              {lastRoute.why}
            </p>
          </div>
        </SectionCard>
      )}

      {lastOrderId && (
        <ExplorerLinkCard
          title="SoDEX order"
          status={statusLabel || "Pending"}
          statusTone={filled ? "ok" : canceled ? "danger" : "warn"}
          hash={v?.sodexOrderId || lastOrderId}
          explorerUrl={v?.sodexAppUrl || live.config?.sodex?.appUrl || null}
          networkLabel={`${live.network} · SoDEX vault (not ValueChain HATCHLog)`}
          detail={
            filled
              ? "Fill proven: executedQty > 0, trade exists, balance evidence checked."
              : canceled
                ? `Terminal SoDEX status ${v?.sodexStatus || v?.hatchStatus}. No fill credited unless evidence is complete.`
                : v?.waitingForMatch
                  ? "Relay accepted. FILLED only after SoDEX history + trades + balances confirm it."
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
              <Row k="Trade ID" v={v?.tradeIds?.length ? v.tradeIds.map(String).join(", ") : "Synchronization Pending"} />
              <Row k="Execution status" v={String(v?.executionStatus || v?.hatchStatus || "UNKNOWN")} />
              <Row k="Filled quantity" v={v?.filledQty != null ? String(v.filledQty) : "Synchronization Pending"} />
              <Row
                k="Fill proven"
                v={v?.fillEvidence?.fillProven ? "Yes (qty + trade + balance)" : "Not yet"}
              />
              <Row k="Last sync" v={v?.lastSyncAt ? fmtDate(v.lastSyncAt) : "-"} />
              <div className="flex flex-wrap gap-3 pt-2 text-xs">
                {v?.sodexAppUrl && (
                  <a
                    href={v.sodexAppUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-200/80 hover:text-sky-100"
                  >
                    SoDEX portfolio <ExternalLink className="h-3 w-3" />
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
              SoDEX minNotional is typically $5. Raise this weekly amount before approving.
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
              Prepare this week
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          title="Execute selected market"
          subtitle="You pick. Live books only. Wallet signature required."
        >
          {notReady ? (
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-xs text-amber-100/90">
              Almost ready. <StatusPip tone={ready.tone} label={ready.label} className="inline-flex" /> Finish
              setup under Trading, then come back.
            </div>
          ) : (
            <ol className="space-y-2 text-sm text-white/70">
              <li>1. Pick a market from Available today.</li>
              <li>2. Approve the EIP-712 request in your wallet.</li>
              <li>3. HATCH relays your signature only (never re-signs).</li>
              <li>4. FILLED only after SoDEX history + trades + balances prove it.</li>
            </ol>
          )}
          {selectedSymbol && (
            <p className="mt-3 text-xs text-emerald-200/80">Selected: {selectedSymbol}</p>
          )}
          {phase && <p className="mt-2 text-xs text-sky-200/80">{phase}…</p>}
          <Button
            className="mt-4 bg-white text-black hover:bg-white/90"
            disabled={
              !selectedSymbol ||
              signAndRelay.isPending ||
              signing ||
              notReady ||
              Number(policy.amountUsd) < 5 ||
              (!!lastOrderId && !!v?.waitingForMatch && !canceled && !filled)
            }
            onClick={() => signAndRelay.mutate()}
          >
            {signAndRelay.isPending || signing
              ? "Waiting for your approval…"
              : v?.waitingForMatch && !canceled && !filled
                ? "Waiting for SoDEX fill…"
                : filled
                  ? "Invest again"
                  : selectedSymbol
                    ? `Invest in ${displayBase(selectedSymbol)}`
                    : "Select a market first"}
          </Button>

          <div className="mt-4">
            <AdvancedDetails label="How this works">
              <p className="text-xs leading-relaxed text-white/55">
                Markets are discovered live from SoDEX. Empty, cancel-only, and maintenance books are skipped.
                Fills are never inferred from relay HTTP.
              </p>
            </AdvancedDetails>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
