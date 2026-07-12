import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { fmtUsd } from "@/lib/format";
import { motion } from "framer-motion";

export default function ChildProjections() {
  const { childId } = useParams();
  const assumptions = useQuery({
    queryKey: ["assumptions"],
    queryFn: () => api.get<any>("/api/projections/assumptions", { auth: false }),
  });
  const allowances = useQuery({
    queryKey: ["allowances"],
    queryFn: () => api.get<any>("/api/allowances"),
  });
  const policy = (allowances.data?.policies || []).find((p: any) => p.childId === childId);
  const weekly = policy?.amountUsd != null ? Number(policy.amountUsd) : null;

  const scenarios = useMutation({
    mutationFn: () => {
      if (weekly == null || !(weekly > 0)) {
        return Promise.reject(new Error("Set a weekly allowance first"));
      }
      return api.post<any>("/api/projections/scenarios", {
        childId,
        years: 10,
        startingUsd: 0,
        weeklyAllowanceUsd: weekly,
        monthlyAllowanceUsd: weekly * 4,
      });
    },
  });

  // Auto-load educational scenarios when a real weekly policy exists
  useEffect(() => {
    if (weekly != null && weekly > 0 && !scenarios.data && !scenarios.isPending && !scenarios.isError) {
      scenarios.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekly, childId]);

  const weeklyPack = scenarios.data?.weekly || {};
  const bandKeys = Object.keys(weeklyPack);
  const years = weeklyPack.base?.points?.length
    ? weeklyPack.base.points.map((p: any) => p.year)
    : [];
  const chart = years.map((year: number, i: number) => {
    const row: Record<string, number> = { year };
    for (const k of bandKeys) {
      row[k] = Number(weeklyPack[k]?.points?.[i]?.valueUsd ?? 0);
    }
    return row;
  });

  const terminal = weeklyPack.base?.points?.length
    ? Number(weeklyPack.base.points[weeklyPack.base.points.length - 1]?.valueUsd ?? 0)
    : null;

  const pointAt = (year: number) => {
    const pts = weeklyPack.base?.points || [];
    const hit = pts.find((p: any) => Number(p.year) === year) || pts[Math.min(year - 1, pts.length - 1)];
    return hit ? Number(hit.valueUsd ?? 0) : null;
  };

  const bandLabel = (k: string) => {
    const map: Record<string, string> = {
      conservative: "Careful",
      base: "Balanced",
      optimistic: "Optimistic",
    };
    return map[k.toLowerCase()] || k;
  };

  const milestones = [
    {
      label: "Week 1",
      body: `Their first ${weekly != null ? fmtUsd(weekly) : "allowance"} lands. The habit begins.`,
      value: weekly,
    },
    {
      label: "Year 1",
      body: "About a year of quiet consistency. Still early, already real.",
      value: pointAt(1),
    },
    {
      label: "Year 5",
      body: "Five years of showing up. Compounding starts to feel visible.",
      value: pointAt(5),
    },
    {
      label: "Year 10",
      body: "A decade of weekly care. This is the story you are writing together.",
      value: pointAt(10) ?? terminal,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Child-specific educational projection"
        subtitle={
          weekly != null && weekly > 0
            ? `If you keep investing about ${fmtUsd(weekly)} every week…`
            : "Set a weekly allowance to see teaching scenarios."
        }
      >
        <p className="text-sm leading-relaxed text-white/60">
          These are teaching scenarios based on documented assumption bands: not promises, not live yields, and not
          financial advice. They start at $0 because HATCH has no child allocation ledger; the family SoDEX balance is
          never treated as the child&apos;s principal.
        </p>
        {assumptions.data && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3 text-sm">
            {Object.entries(assumptions.data.documentedYieldBands || {}).map(([k, v]: any) => (
              <div key={k} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="text-xs text-white/45">{bandLabel(k)}</div>
                <div className="mt-1 text-lg font-medium text-white">{(Number(v) * 100).toFixed(1)}% / yr</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="10-year allowance scenario"
        subtitle={weekly != null && weekly > 0 ? `Weekly input: ${fmtUsd(weekly)}` : "Needs a weekly allowance"}
        action={
          <Button
            className="bg-white text-black hover:bg-white/90"
            size="sm"
            onClick={() => scenarios.mutate()}
            disabled={scenarios.isPending || weekly == null || !(weekly > 0)}
          >
            {scenarios.isPending ? "Calculating…" : chart.length ? "Refresh" : "Show story"}
          </Button>
        }
      >
        {scenarios.isError && (
          <div className="mb-3 text-sm text-rose-300">
            {(scenarios.error as any)?.message || "Couldn't run projection"}
          </div>
        )}

        {chart.length > 0 && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {milestones.map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, type: "spring", stiffness: 120, damping: 18 }}
                className="rounded-2xl border border-white/10 bg-gradient-to-b from-sky-500/[0.07] to-transparent p-4"
              >
                <div className="text-xs font-medium text-sky-200/80">{m.label}</div>
                <div className="mt-2 text-xl font-medium tracking-tight text-white">
                  {m.value != null && Number.isFinite(m.value) ? fmtUsd(m.value) : "-"}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-white/50">{m.body}</p>
              </motion.div>
            ))}
          </div>
        )}

        {terminal != null && Number.isFinite(terminal) && (
          <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
            <div className="text-xs uppercase tracking-wider text-sky-200/70">Balanced scenario</div>
            <div className="mt-1 text-2xl font-medium tracking-tight">{fmtUsd(terminal)}</div>
            <p className="mt-1 text-xs text-white/50">
              Illustrative total after 10 years of weekly investing. Not a guarantee.
            </p>
          </div>
        )}

        {chart.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickFormatter={(v) => fmtUsd(v).replace(".00", "")}
                />
                <Tooltip
                  contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }}
                  formatter={(v: any, name: any) => [fmtUsd(Number(v)), bandLabel(String(name))]}
                />
                <Legend formatter={(v) => bandLabel(String(v))} wrapperStyle={{ fontSize: 12 }} />
                {bandKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={bandLabel(k)}
                    stroke={["#7dd3fc", "#a7f3d0", "#e5e5e5"][i % 3]}
                    strokeWidth={1.75}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-white/50">Tap Show story to project illustrative outcomes.</div>
        )}

        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3 text-xs leading-relaxed text-amber-100/80">
          {(scenarios.data?.note || assumptions.data?.note || "Assumption bands for education only.")} Markets can go
          down as well as up.
        </div>
      </SectionCard>
    </div>
  );
}
