import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const COLORS = ["#ffffff", "#a1a1aa", "#71717a", "#52525b", "#3f3f46", "#27272a", "#18181b"];

export default function ChildLearn() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const childId = me.data?.childId || me.data?.scopes?.childId;
  const lessons = useQuery({ queryKey: ["lessons", childId], queryFn: () => api.get<any>(`/api/lessons/${childId}`), enabled: !!childId });
  const mag7 = useQuery({ queryKey: ["mag7"], queryFn: () => api.get<any>("/api/ssi/mag7/constituents", { auth: false }) });
  const items: any[] = (lessons.data?.lessons || lessons.data || []).filter((l: any) => l.status === "READY");
  const constituents = mag7.data?.data?.data || [];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-medium tracking-tight">What's in MAG7?</h1>
        <p className="mt-2 text-sm text-white/60">A basket of the biggest crypto coins. Owning MAG7 is like owning a little of each.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="h-48"><ResponsiveContainer><PieChart>
            <Pie data={constituents} dataKey="weight" nameKey="symbol" innerRadius={40} outerRadius={80} stroke="none">
              {constituents.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
          </PieChart></ResponsiveContainer></div>
          <div className="space-y-1 text-sm">
            {constituents.map((c: any, i: number) => (
              <div key={c.currency_id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 capitalize"><span className="h-2 w-2 rounded" style={{ background: COLORS[i % COLORS.length] }} />{c.symbol}</span>
                <span className="font-mono text-white/70">{(c.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">Your lessons</h2>
        <div className="mt-3 space-y-2">
          {items.length === 0 && <div className="text-sm text-white/50">No lessons yet.</div>}
          {items.map((l) => (
            <details key={l.id} className="rounded-xl border border-white/10 bg-white/[0.02]">
              <summary className="cursor-pointer px-4 py-3 text-sm"><span className="font-medium">{l.title || l.kind}</span> <span className="ml-2 text-xs text-white/40">{fmtRelative(l.createdAt)}</span></summary>
              <div className="border-t border-white/10 p-4 text-sm text-white/85 whitespace-pre-wrap">{l.body}</div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
