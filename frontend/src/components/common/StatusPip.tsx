import { cn } from "@/lib/utils";

export type PipTone = "ok" | "warn" | "danger" | "info" | "muted";

const map: Record<PipTone, string> = {
  ok: "bg-[hsl(142_71%_45%)]",
  warn: "bg-[hsl(38_92%_55%)]",
  danger: "bg-[hsl(350_89%_60%)]",
  info: "bg-[hsl(199_89%_60%)]",
  muted: "bg-white/30",
};

export function StatusPip({ tone = "muted", label, className }: { tone?: PipTone; label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-white/70", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", map[tone])} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
