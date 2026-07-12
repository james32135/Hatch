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

  const bandLabel = (k: string) => {
    const map: Record<string, string> = {
      conservative: "Careful",
      base: "Balanced",
      optimistic: "Optimistic",
    };
    return map[k.toLowerCase()] || k;
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="What consistency can look like"
        subtitle={`If you keep investing about ${fmtUsd(weekly)} every week…`}
      >
        <p className="text-sm leading-relaxed text-white/60">
          These are teaching scenarios based on documented assumption bands: not promises, not live yields, and not
          financial advice.
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
        title="10-year story"
        subtitle={`Weekly input: ${fmtUsd(weekly)}`}
        action={
          <Button className="bg-white text-black hover:bg-white/90" size="sm" onClick={() => scenarios.mutate()} disabled={scenarios.isPending}>
            {scenarios.isPending ? "Calculating…" : chart.length ? "Refresh" : "Show story"}
          </Button>
        }
      >
        {scenarios.isError && (
          <div className="mb-3 text-sm text-rose-300">{(scenarios.error as any)?.message || "Couldn't run projection"}</div>
        )}

        {terminal != null && Number.isFinite(terminal) && (
          <div className="mb-4 rounded-2xl border border-sky-400/20 bg-sky-400/[0.06] p-4">
            <div className="text-xs uppercase tracking-wider text-sky-200/70">Balanced scenario</div>
            <div className="mt-1 text-2xl font-medium tracking-tight">{fmtUsd(terminal)}</div>
            <p className="mt-1 text-xs text-white/50">Illustrative total after 10 years of weekly investing. Not a guarantee.</p>
          </div>
        )}

        {chart.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v) => fmtUsd(v).replace(".00", "")} />
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
          {(scenarios.data?.note || assumptions.data?.note || "Assumption bands for education only.")} Markets can go down
          as well as up.
        </div>
      </SectionCard>
    </div>
  );
}
