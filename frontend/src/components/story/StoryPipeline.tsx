import { motion } from "framer-motion";
import { useMemo } from "react";
import { Check, Circle } from "lucide-react";

export type PipelineStepId =
  | "scheduled"
  | "waiting"
  | "signed"
  | "submitted"
  | "filled"
  | "portfolio"
  | "lesson"
  | "recorded";

export type PipelineStep = {
  id: PipelineStepId;
  label: string;
  detail?: string;
  state: "done" | "active" | "pending";
};

const DEFAULT_LABELS: Record<PipelineStepId, string> = {
  scheduled: "Allowance scheduled",
  waiting: "Waiting approval",
  signed: "Wallet signed",
  submitted: "Order submitted",
  filled: "Order filled",
  portfolio: "Portfolio updated",
  lesson: "Lesson generated",
  recorded: "Recorded on ValueChain",
};

/** Derive pipeline from live signals. Later steps cannot complete before earlier ones. */
export function derivePipeline(input: {
  hasPolicy?: boolean;
  policyPaused?: boolean;
  pendingHandoff?: boolean;
  hasRelay?: boolean;
  orderStatus?: string | null;
  sodexStatus?: string | null;
  hasHoldingsOrTx?: boolean;
  hasLesson?: boolean;
  valuechainOk?: boolean;
  valuechainRecorded?: boolean;
  waitingForMatch?: boolean;
}): PipelineStep[] {
  const order = String(input.orderStatus || input.sodexStatus || "").toUpperCase();
  const filled = ["FILLED", "DONE", "COMPLETED"].some((s) => order.includes(s));
  const rejected = ["REJECTED", "FAILED", "EXPIRED", "CANCELED", "CANCELLED"].some((s) =>
    order.includes(s),
  );
  const submitted =
    filled ||
    rejected ||
    ["SUBMITTED", "PENDING", "OPEN", "NEW", "WAITING_FOR_MATCH", "PARTIALLY_FILLED"].some((s) =>
      order.includes(s),
    ) ||
    !!input.hasRelay;
  const signed = submitted || !!input.hasRelay;
  const waiting = !!input.pendingHandoff && !signed;
  const scheduled = !!input.hasPolicy && !input.policyPaused;

  const flags: Record<PipelineStepId, boolean> = {
    scheduled,
    waiting: waiting || signed,
    signed,
    submitted,
    filled: filled && submitted,
    portfolio: filled && !!input.hasHoldingsOrTx,
    lesson: filled && !!input.hasHoldingsOrTx && !!input.hasLesson,
    recorded:
      filled &&
      !!input.hasHoldingsOrTx &&
      (!!input.valuechainRecorded || (!!input.valuechainOk && !!input.hasLesson)),
  };

  if (input.waitingForMatch && submitted && !filled && !rejected) {
    flags.filled = false;
    flags.portfolio = false;
    flags.lesson = false;
    flags.recorded = false;
  }

  const orderIds = Object.keys(DEFAULT_LABELS) as PipelineStepId[];
  let foundActive = false;
  return orderIds.map((id) => {
    const done = flags[id];
    let state: PipelineStep["state"] = "pending";
    if (done) state = "done";
    else if (!foundActive) {
      // First incomplete after some progress, or first if none done
      const anyDone = orderIds.some((k) => flags[k]);
      if (!anyDone && id === "scheduled") {
        state = "active";
        foundActive = true;
      } else if (anyDone) {
        state = "active";
        foundActive = true;
      }
    }
    return { id, label: DEFAULT_LABELS[id], state };
  });
}

export function StoryPipeline({
  steps,
  title = "Live investment path",
  subtitle = "From weekly allowance to a recorded lesson.",
}: {
  steps: PipelineStep[];
  title?: string;
  subtitle?: string;
}) {
  const activeIndex = useMemo(() => steps.findIndex((s) => s.state === "active"), [steps]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <div className="mb-4">
        <div className="text-sm font-medium text-white/90">{title}</div>
        <p className="mt-0.5 text-xs text-white/45">{subtitle}</p>
      </div>

      {/* Desktop horizontal */}
      <div className="hidden md:block">
        <svg viewBox="0 0 960 120" className="h-28 w-full" role="img" aria-label={title}>
          <defs>
            <linearGradient id="pipeGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(56 189 248)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="rgb(52 211 153)" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {steps.map((s, i) => {
            if (i === steps.length - 1) return null;
            const x1 = 40 + i * 115;
            const x2 = 40 + (i + 1) * 115;
            const done = s.state === "done" && steps[i + 1].state !== "pending";
            return (
              <line
                key={`l-${s.id}`}
                x1={x1 + 14}
                y1={36}
                x2={x2 - 14}
                y2={36}
                stroke={done || s.state === "done" ? "url(#pipeGlow)" : "rgba(255,255,255,0.12)"}
                strokeWidth={2}
                strokeDasharray={s.state === "active" ? "4 4" : undefined}
              />
            );
          })}
          {steps.map((s, i) => {
            const x = 40 + i * 115;
            const fill =
              s.state === "done" ? "#34d399" : s.state === "active" ? "#38bdf8" : "rgba(255,255,255,0.12)";
            return (
              <g key={s.id}>
                {s.state === "active" && (
                  <circle cx={x} cy={36} r={16} fill="none" stroke="#38bdf8" strokeOpacity={0.35}>
                    <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={36} r={11} fill={fill} />
                {s.state === "done" && (
                  <path d={`M ${x - 4} 36 l 3 3 l 6 -7`} fill="none" stroke="#04120c" strokeWidth={2} />
                )}
                <text x={x} y={68} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10">
                  {s.label.split(" ").slice(0, 2).join(" ")}
                </text>
                <text x={x} y={82} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
                  {s.label.split(" ").slice(2).join(" ")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Mobile vertical */}
      <ol className="space-y-0 md:hidden">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span
                className={`absolute left-[11px] top-6 h-[calc(100%-8px)] w-px ${
                  s.state === "done" ? "bg-emerald-400/50" : "bg-white/10"
                }`}
              />
            )}
            <span
              className={`relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                s.state === "done"
                  ? "border-emerald-400/40 bg-emerald-400 text-black"
                  : s.state === "active"
                    ? "border-sky-400/50 bg-sky-400/20 text-sky-200"
                    : "border-white/15 bg-white/5 text-white/30"
              }`}
            >
              {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}
            </span>
            <motion.div
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={i === activeIndex ? "text-white" : "text-white/60"}
            >
              <div className="text-sm font-medium">{s.label}</div>
              {s.detail && <div className="text-xs text-white/40">{s.detail}</div>}
            </motion.div>
          </li>
        ))}
      </ol>
    </div>
  );
}
