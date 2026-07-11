import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { fmtUsd } from "@/lib/format";

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
  const weekly = Number(policy?.amountUsd ?? 20);

  const scenarios = useMutation({
    mutationFn: () =>
      api.post<any>("/api/projections/scenarios", {
        childId,
        years: 10,
        weeklyAllowanceUsd: weekly,
        monthlyAllowanceUsd: weekly * 4,
      }),
  });

  // Backend returns { weekly: { conservative, base, optimistic }, monthly, sensitivityWeekly, note }
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

  return (
    <div className="space-y-4">
      <SectionCard
        title="Assumption bands"
        subtitle="These are assumption bands for parent education — not live APYs."
      >
        {assumptions.data && (
          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            {Object.entries(assumptions.data.documentedYieldBands || {}).map(([k, v]: any) => (
              <div key={k} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs uppercase text-white/50">{k}</div>
                <div className="mt-1 font-mono text-white">{(Number(v) * 100).toFixed(2)}%</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Run scenarios"
        subtitle={`Weekly allowance input: ${fmtUsd(weekly)} (from policy or default $20)`}
        action={
          <Button
            className="bg-white text-black hover:bg-white/90"
            size="sm"
            onClick={() => scenarios.mutate()}
            disabled={scenarios.isPending}
          >
            Run
          </Button>
        }
      >
        {scenarios.isError && (
          <div className="mb-3 text-sm text-[hsl(350_89%_70%)]">
            {(scenarios.error as any)?.message || "Projection failed"}
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
                  contentStyle={{
                    background: "#0a0a0a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {bandKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={["#ffffff", "#a1a1aa", "#52525b"][i % 3]}
                    strokeWidth={1.5}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-sm text-white/50">Click Run to project terminal values.</div>
        )}
        {(scenarios.data?.note || assumptions.data?.note) && (
          <div className="mt-3 rounded-lg border border-[hsl(38_92%_55%/0.3)] bg-[hsl(38_92%_55%/0.06)] p-3 text-xs text-[hsl(38_92%_75%)]">
            {scenarios.data?.note || assumptions.data?.note} Assumptions, not guarantees.
          </div>
        )}
      </SectionCard>
    </div>
  );
}
