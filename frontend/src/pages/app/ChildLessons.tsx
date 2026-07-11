import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { Button } from "@/components/ui/button";
import { StatusPip } from "@/components/common/StatusPip";
import { toast } from "sonner";
import { fmtRelative } from "@/lib/format";

export default function ChildLessons() {
  const { childId } = useParams();
  const qc = useQueryClient();
  const lessons = useQuery({ queryKey: ["lessons", childId], queryFn: () => api.get<any>(`/api/lessons/${childId}`), enabled: !!childId });
  const gen = useMutation({
    mutationFn: () => api.post<any>(`/api/lessons/${childId}/generate`, { kind: "portfolio_delta" }),
    onSuccess: () => { toast.success("Lesson queued"); qc.invalidateQueries({ queryKey: ["lessons", childId] }); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const items = lessons.data?.lessons || lessons.data || [];
  return (
    <SectionCard title="Lessons" action={<Button size="sm" className="bg-white text-black hover:bg-white/90" onClick={() => gen.mutate()} disabled={gen.isPending}>Generate</Button>}>
      {items.length === 0 ? <div className="text-sm text-white/50">No lessons yet.</div> : (
        <div className="space-y-2">
          {items.map((l: any) => (
            <details key={l.id} className="rounded-lg border border-white/10 bg-white/[0.02]">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm">
                <div><span className="font-medium">{l.title || l.kind}</span> <span className="ml-2 text-white/40 text-xs">{fmtRelative(l.createdAt)}</span></div>
                <StatusPip tone={l.status === "READY" ? "ok" : l.status === "FAILED" ? "danger" : "warn"} label={l.status} />
              </summary>
              <div className="border-t border-white/10 p-4 text-sm text-white/80 whitespace-pre-wrap">{l.body || "—"}</div>
              {l.citationsJson && <div className="border-t border-white/10 p-4 text-xs text-white/50"><div className="mb-1 uppercase tracking-wide">Sources</div><pre className="overflow-x-auto">{JSON.stringify(l.citationsJson, null, 2)}</pre></div>}
            </details>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
