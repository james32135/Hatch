import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowUpRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string; sources?: string[]; followUps?: string[] };

function MarketSpark({ markets }: { markets: any[] }) {
  if (!markets?.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {markets.slice(0, 6).map((m) => (
        <div
          key={m.symbol}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-white/90">{String(m.symbol).replace(/_vUSDC$/, "")}</span>
            <span
              className={`text-[10px] uppercase tracking-wider ${
                m.executable ? "text-emerald-300/90" : "text-amber-200/80"
              }`}
            >
              {m.executable ? "Executable" : "Blocked"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[11px] text-white/45">
            <span>ask {m.bestAsk ?? "—"}</span>
            <span>score {m.score}</span>
            <span className="col-span-2">depth ${Number(m.askDepthUsd || 0).toFixed(0)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function JourneySvg() {
  return (
    <svg viewBox="0 0 640 220" className="h-auto w-full max-w-xl opacity-90" aria-hidden>
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="640" height="220" fill="url(#g1)" opacity="0.12" rx="24" />
      <path
        d="M40 160 C140 40, 220 180, 320 90 S500 40, 600 120"
        fill="none"
        stroke="#34d399"
        strokeWidth="2.5"
        strokeOpacity="0.7"
      />
      {[40, 180, 320, 460, 600].map((x, i) => (
        <circle key={x} cx={x} cy={[160, 95, 90, 70, 120][i]} r="6" fill="#0b1220" stroke="#38bdf8" strokeWidth="2" />
      ))}
      <text x="40" y="200" fill="#94a3b8" fontSize="11">
        Scan books
      </text>
      <text x="280" y="200" fill="#94a3b8" fontSize="11">
        Route
      </text>
      <text x="520" y="200" fill="#94a3b8" fontSize="11">
        Fill
      </text>
    </svg>
  );
}

export default function Agent() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [marketsTop, setMarketsTop] = useState<any[]>([]);

  const prompts = useQuery({
    queryKey: ["agent-prompts"],
    queryFn: () => api.get<{ prompts: string[] }>("/api/ai/agent/prompts"),
  });

  const children = useQuery({
    queryKey: ["children"],
    queryFn: () => api.get<any>("/api/children"),
  });
  const childId = children.data?.children?.[0]?.id as string | undefined;

  const ask = useMutation({
    mutationFn: async (text: string) => {
      const nextMsgs = [...messages, { role: "user" as const, content: text }];
      setMessages(nextMsgs);
      return api.post<any>("/api/ai/agent", {
        childId,
        messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      });
    },
    onSuccess: (data) => {
      setMarketsTop(data.marketsTop || []);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content,
          sources: data.sources,
          followUps: data.followUps,
        },
      ]);
    },
    onError: (e: any) => toast.error(e?.message || "Agent unavailable"),
  });

  const quick = useMemo(() => prompts.data?.prompts || [], [prompts.data]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || ask.isPending) return;
    setInput("");
    ask.mutate(t);
  };

  return (
    <div className="relative space-y-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-6 -top-10 h-64 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 20% 0%, rgba(52,211,153,0.14), transparent 60%), radial-gradient(ellipse 50% 60% at 90% 10%, rgba(56,189,248,0.1), transparent 55%)",
        }}
      />

      <div className="relative grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-300/70">Investment Copilot</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Ask with live SoDEX data
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">
              Answers are grounded in official order books, balances, and your execution history. No invented fills.
            </p>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-[#0a0a0f]/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl md:p-5">
            <div className="mb-4 max-h-[48vh] space-y-3 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <div className="flex flex-col items-start gap-4 py-2">
                  <JourneySvg />
                  <p className="text-sm text-white/50">
                    Try a quick prompt, or ask anything about liquidity, MAG7, receipts, or this week's plan.
                  </p>
                </div>
              )}
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={`${m.role}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 120, damping: 18 }}
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "ml-8 bg-white text-black"
                        : "mr-4 border border-white/[0.07] bg-white/[0.03] text-white/85"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {m.sources?.length ? (
                      <div className="mt-3 border-t border-white/10 pt-2 text-[11px] text-white/40">
                        Sources: {m.sources.join(" · ")}
                      </div>
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>
              {ask.isPending && (
                <div className="flex items-center gap-2 text-xs text-sky-200/80">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading live SoDEX markets…
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit(input)}
                placeholder="Ask about MAG7 liquidity, $10 routing, or a receipt…"
                className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none ring-emerald-400/30 placeholder:text-white/30 focus:ring-2"
              />
              <Button
                className="bg-emerald-400 text-black hover:bg-emerald-300"
                disabled={ask.isPending || !input.trim()}
                onClick={() => submit(input)}
              >
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {quick.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-xs text-white/60 transition hover:border-emerald-400/30 hover:text-white"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.75rem] border border-white/[0.08] bg-[#0a0a0f]/70 p-5 backdrop-blur-xl">
            <div className="mb-3 flex items-center gap-2 text-sm text-white/80">
              <Sparkles className="h-4 w-4 text-emerald-300" strokeWidth={1.5} />
              Live market board
            </div>
            <MarketSpark markets={marketsTop} />
            {!marketsTop.length && (
              <p className="text-xs text-white/40">Ask a question to load the current executable scan.</p>
            )}
          </div>
          <div className="rounded-[1.75rem] border border-white/[0.08] bg-gradient-to-br from-emerald-400/10 via-transparent to-sky-400/10 p-5">
            <p className="text-sm font-medium text-white/90">How HATCH invests</p>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-white/55">
              <li>Scan every TRADING market and score ask liquidity.</li>
              <li>Never submit into empty ask books (MAG7 blocked when asks=0).</li>
              <li>Route deterministically; store why the market was chosen.</li>
              <li>Confirm fills only from SoDEX order history and trades.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
