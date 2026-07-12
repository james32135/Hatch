import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  detail,
  icon: Icon = Sparkles,
  actionLabel,
  onAction,
  className = "",
}: {
  title: string;
  detail?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-start gap-3 rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-6 ${className}`}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-base font-medium tracking-tight text-white">{title}</div>
        {detail && <p className="mt-1 max-w-md text-sm leading-relaxed text-white/55">{detail}</p>}
      </div>
      {actionLabel && onAction && (
        <Button size="sm" className="mt-1 bg-white text-black hover:bg-white/90" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
