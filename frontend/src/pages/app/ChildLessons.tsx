import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { StatusPip } from "@/components/common/StatusPip";
import { toast } from "sonner";
import { fmtRelative, fmtUsd } from "@/lib/format";
import { friendlyLessonTitle, friendlyLessonStatus, friendlyMarket } from "@/lib/copy";
import { resolveLivePortfolioUsd } from "@/lib/portfolio";
import { BookOpen } from "lucide-react";

export default function ChildLessons() {
  const { childId } = useParams();
  const qc = useQueryClient();
  const lessons = useQuery({
    queryKey: ["lessons", childId],
    queryFn: () => api.get<any>(`/api/lessons/${childId}`),
    enabled: !!childId,
  });
  const portfolio = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
  });
  const gen = useMutation({
    mutationFn: () => api.post<any>(`/api/lessons/${childId}/generate`, { kind: "portfolio_delta" }),
    onSuccess: () => {
      toast.success("Writing a new lesson…");
      qc.invalidateQueries({ queryKey: ["lessons", childId] });
    },
    onError: (e: any) => toast.error(e?.message || "Couldn't start a lesson"),
  });
  const items = lessons.data?.lessons || lessons.data || [];
  const total = resolveLivePortfolioUsd(portfolio.data);
  const holdings = portfolio.data?.holdings || [];
  const top = holdings
    .slice()
    .sort((a: any, b: any) => Number(b.usdValue ?? b.valueUsd ?? 0) - Number(a.usdValue ?? a.valueUsd ?? 0))[0];
  const contextHint =
    total != null
      ? `Portfolio ${fmtUsd(total)}${top ? ` · largest holding ${friendlyMarket(top.symbol || top.token)}` : ""}`
      : "Tied to their live portfolio when available.";

  return (
    <SectionCard
      title="Lessons"
      subtitle={`Short explanations from real holdings and moves. ${contextHint}`}
      action={
        <Button
          size="sm"
          className="bg-white text-black hover:bg-white/90"
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
        >
          New lesson
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          title="No lessons yet"
          detail="After the first investment, generate a lesson that explains what happened in plain language."
          icon={BookOpen}
          actionLabel="Generate lesson"
          onAction={() => gen.mutate()}
        />
      ) : (
        <div className="space-y-2">
          {items.map((l: any) => (
            <details key={l.id} className="group rounded-xl border border-white/8 bg-white/[0.02] open:bg-white/[0.03]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-white/95">{friendlyLessonTitle(l)}</div>
                  <div className="text-xs text-white/40">{fmtRelative(l.createdAt)}</div>
                </div>
                <StatusPip
                  tone={l.status === "READY" ? "ok" : l.status === "FAILED" ? "danger" : "warn"}
                  label={friendlyLessonStatus(l.status)}
                />
              </summary>
              <div className="border-t border-white/8 p-4 text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
                {l.body || "-"}
              </div>
            </details>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
