import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtUsd, fmtPct, fmtRelative } from "@/lib/format";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Unavailable } from "@/components/common/Unavailable";

export default function ChildHome() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const childId = me.data?.childId || me.data?.scopes?.childId;
  const p = useQuery({ queryKey: ["portfolio", childId], queryFn: () => api.get<any>(`/api/portfolio/${childId}`), enabled: !!childId });

  const total = p.data?.latestSnapshot?.totalUsd ?? p.data?.totalUsd;
  const day = p.data?.performance?.dayChangePct;

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-white/40">Your portfolio</div>
        {total == null ? <Unavailable /> : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-7xl font-medium tracking-tight">
            {fmtUsd(total)}
          </motion.div>
        )}
        {day != null && (
          <div className={`mt-2 text-lg ${Number(day) >= 0 ? "text-[hsl(142_71%_55%)]" : "text-[hsl(350_89%_65%)]"}`}>
            {fmtPct(day, { sign: true })} today
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <div className="text-sm text-white/60">Next allowance</div>
        <div className="mt-1 text-2xl">{p.data?.policy?.nextDueAt ? fmtRelative(p.data.policy.nextDueAt) : "—"}</div>
      </div>

      <Button asChild size="lg" className="w-full bg-white text-black hover:bg-white/90"><Link to="/child/why">Why did it change?</Link></Button>
    </div>
  );
}
