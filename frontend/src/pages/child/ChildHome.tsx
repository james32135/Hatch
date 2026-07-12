import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtUsd } from "@/lib/format";
import { resolveLivePortfolioUsd, portfolioFreshness } from "@/lib/portfolio";
import { PortfolioBalanceHero } from "@/components/story/PortfolioBalanceHero";
import { TokenMark } from "@/lib/tokenIcons";
import { friendlyMarket } from "@/lib/copy";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function ChildHome() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const childId = me.data?.childId || me.data?.scopes?.childId;
  const p = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
    refetchInterval: 20_000,
  });
  const allowances = useQuery({
    queryKey: ["allowances-child-view", childId],
    queryFn: () => api.get<any>("/api/allowances"),
    enabled: !!childId,
    refetchInterval: 60_000,
  });

  const total = resolveLivePortfolioUsd(p.data);
  const fresh = portfolioFreshness(p.data);
  const holdings = (p.data?.holdings || []).slice(0, 4);
  const name = me.data?.displayName || me.data?.child?.displayName || "friend";
  const policy = (allowances.data?.policies || []).find((x: any) => x.childId === childId);
  const nextDue = policy?.nextDueAt ? new Date(policy.nextDueAt) : null;
  const weeklyAmt = policy?.amountUsd != null ? Number(policy.amountUsd) : null;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm text-white/50">Hey {name}</div>
        <h1 className="mt-1 text-2xl font-medium tracking-tight text-white">Your family&apos;s investing</h1>
        <p className="mt-2 max-w-md text-sm text-white/55">
          This is your parent&apos;s shared SoDEX spot account, not money allocated
          to you. You can look and learn, but you cannot invest or change anything.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/10 via-transparent to-emerald-500/10 p-6">
        <svg className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 opacity-40" viewBox="0 0 120 120" aria-hidden>
          <circle cx="60" cy="60" r="40" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="6 8">
            <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="24s" repeatCount="indefinite" />
          </circle>
          <circle cx="60" cy="60" r="28" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="4 10">
            <animateTransform attributeName="transform" type="rotate" from="360 60 60" to="0 60 60" dur="18s" repeatCount="indefinite" />
          </circle>
        </svg>
        <div className="text-xs uppercase tracking-widest text-white/40">Family spot trading value</div>
        <div className="mt-3">
          <PortfolioBalanceHero
            portfolio={p.data}
            loading={p.isLoading}
            className="text-6xl font-medium tracking-tight md:text-7xl"
          />
        </div>
        {fresh.sharedAccount && total != null && (
          <p className="mt-2 text-xs text-white/40">
            Managed by your parent · read-only family account · spot balances only
          </p>
        )}
      </div>

      {holdings.length > 0 && (
        <div>
          <div className="mb-3 text-sm text-white/60">Family spot holdings</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {holdings.map((h: any, i: number) => {
              const usd = h.usdValue ?? h.valueUsd;
              const unpriced = usd == null || Number.isNaN(Number(usd));
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <TokenMark symbol={h.symbol || h.token} size={36} />
                  <div>
                    <div className="text-sm font-medium">{friendlyMarket(h.symbol || h.token)}</div>
                    <div className="text-xs text-white/45">
                      {unpriced ? "Waiting for live prices" : fmtUsd(usd)}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="text-sm text-white/60">Next allowance</div>
        <div className="mt-1 text-2xl">
          {weeklyAmt != null && weeklyAmt > 0 ? fmtUsd(weeklyAmt) : "Coming from your parent"}
        </div>
        <p className="mt-2 text-xs text-white/45">
          {policy?.paused
            ? "Allowance is paused right now."
            : nextDue && !Number.isNaN(nextDue.getTime())
              ? `Next planned date: ${nextDue.toLocaleDateString()}. You can watch — you cannot change the schedule.`
              : "Your parent adds a little each week. You get to watch it grow. You cannot change the schedule from here."}
        </p>
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.015] px-4 py-3 text-xs text-white/45">
        Read-only view · no signing · no trading · no settings · no network changes
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button asChild size="lg" className="bg-white text-black hover:bg-white/90">
          <Link to="/child/why">Why did it change?</Link>
        </Button>
        <Button asChild size="lg" variant="secondary" className="bg-white/5 hover:bg-white/10">
          <Link to="/child/learn">Learn something new</Link>
        </Button>
      </div>
    </div>
  );
}
