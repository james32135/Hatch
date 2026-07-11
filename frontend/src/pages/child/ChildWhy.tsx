import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { motion } from "framer-motion";
import { fmtRelative } from "@/lib/format";
import { Unavailable } from "@/components/common/Unavailable";

export default function ChildWhy() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const childId = me.data?.childId || me.data?.scopes?.childId;
  const lessons = useQuery({ queryKey: ["lessons", childId], queryFn: () => api.get<any>(`/api/lessons/${childId}`), enabled: !!childId });
  const list: any[] = lessons.data?.lessons || lessons.data || [];
  const latest = list.filter((l) => l.status === "READY").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight">Why did it change?</h1>
      {!latest ? <div className="mt-6"><Unavailable title="No lesson yet" detail="Ask a parent to refresh lessons." /></div> : (
        <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <div className="text-xs uppercase tracking-wide text-white/40">{fmtRelative(latest.createdAt)}</div>
          <h2 className="mt-2 text-xl font-medium">{latest.title || latest.kind}</h2>
          <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">{latest.body}</div>
        </motion.article>
      )}
    </div>
  );
}
