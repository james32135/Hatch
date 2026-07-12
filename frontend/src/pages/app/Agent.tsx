import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtUsd } from "@/lib/format";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  followUps?: string[];
  marketsTop?: any[];
};

const GROUPS: Record<string, string[]> = {
  Investment: [
    "Best investment today",
    "Where should I invest $20",
    "Safest SSI",
    "Compare MAG7 vs BTC",
  ],
  Markets: [
    "Highest liquidity today",
    "Market summary",
    "Compare MAG7 vs USSI liquidity",
    "Should I buy MAG7 today?",
  ],
  Portfolio: [
    "Explain my portfolio",
    "Explain my last trade",
    "Why wasn't my last order filled?",
    "Risk report",
  ],
  Learning: [
    "Teach my child diversification",
    "Explain dollar-cost averaging",
    "Compare SSI indexes",
  ],
};

function EmptyHero() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 pb-8 pt-10 text-center md:pt-16">
      <motion.svg
        viewBox="0 0 720 280"
        className="mb-8 h-auto w-full max-w-lg"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        aria-hidden
      >
        <defs>
          <linearGradient id="copilotGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#a7f3d0" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <rect width="720" height="280" rx="32" fill="url(#copilotGlow)" opacity="0.18" />
        <motion.circle
          cx="180"
          cy="140"
          r="48"
          fill="none"
          stroke="#34d399"
          strokeWidth="1.5"
          strokeOpacity="0.5"
          animate={{ r: [44, 52, 44], opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M120 170 C220 60, 320 200, 420 100 S580 70, 640 150"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.2"
          strokeOpacity="0.75"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
        />
        {[160, 300, 440, 580].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={[155, 120, 105, 145][i]}
            r="7"
            fill="#071018"
            stroke="#34d399"
            strokeWidth="2"
          />
        ))}
        <text x="140" y="230" fill="#94a3b8" fontSize="13">
          Family
        </text>
        <text x="300" y="230" fill="#94a3b8" fontSize="13">
          Markets
        </text>
        <text x="440" y="230" fill="#94a3b8" fontSize="13">
          Fill
        </text>
        <text x="560" y="230" fill="#94a3b8" fontSize="13">
          Future
        </text>
      </motion.svg>

      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-300/75">
        Investment Copilot
      </p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
        Ask anything about investing for your family
      </h1>
      <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-white/50">
        Grounded in live SoDEX books, your wallet balances, and real receipts. No invented fills.
      </p>
    </div>
  );
}

function StreamingDots() {
  return (
    <span className="inline-flex gap-1 px-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-emerald-300/80"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

export default function Agent() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [displayed, setDisplayed] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const children = useQuery({
    queryKey: ["children"],
    queryFn: () => api.get<any>("/api/children"),
  });
  const childId = children.data?.children?.[0]?.id as string | undefined;

  const portfolio = useQuery({
    queryKey: ["portfolio", childId],
    queryFn: () => api.get<any>(`/api/portfolio/${childId}`),
    enabled: !!childId,
    refetchInterval: 30_000,
  });

  const markets = useQuery({
    queryKey: ["executable-markets"],
    queryFn: () => api.get<any>("/api/sodex/markets/executable", { auth: false }),
    refetchInterval: 45_000,
  });

  const ask = useMutation({
    mutationFn: async (text: string) => {
      const nextMsgs = [...messages, { role: "user" as const, content: text }];
      setMessages(nextMsgs);
      setDisplayed("");
      return api.post<any>("/api/ai/agent", {
        childId,
        messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      });
    },
    onSuccess: (data) => {
      const full = String(data.content || "");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: full,
          sources: data.sources,
          followUps: data.followUps,
          marketsTop: data.marketsTop,
        },
      ]);
      // Soft stream reveal
      let i = 0;
      const step = Math.max(2, Math.floor(full.length / 80));
      const tick = () => {
        i = Math.min(full.length, i + step);
        setDisplayed(full.slice(0, i));
        if (i < full.length) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    onError: (e: any) => toast.error(e?.message || "Copilot unavailable"),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, displayed, ask.isPending]);

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || ask.isPending) return;
    setInput("");
    ask.mutate(t);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const board = lastAssistant?.marketsTop?.length
    ? lastAssistant.marketsTop
    : markets.data?.markets?.filter((m: any) => m.executable).slice(0, 6) || [];

  const holdings = portfolio.data?.holdings || [];
  const totalUsd = portfolio.data?.totalUsd ?? portfolio.data?.performance?.currentUsd;

  const empty = messages.length === 0;

  return (
    <div className="relative -mx-5 flex min-h-[calc(100dvh-7.5rem)] flex-col md:-mx-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(52,211,153,0.12), transparent 55%), radial-gradient(ellipse 40% 30% at 80% 20%, rgba(56,189,248,0.08), transparent 50%)",
        }}
      />

      <div className="relative flex min-h-0 flex-1 gap-0">
        {/* Conversation ~72% */}
        <div className="flex min-w-0 flex-[3] flex-col">
          <div className="flex items-center justify-between px-4 pb-2 pt-1 md:px-8">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Sparkles className="h-4 w-4 text-emerald-300" strokeWidth={1.5} />
              Copilot
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-white/50 hover:text-white lg:hidden"
              onClick={() => setPanelOpen((v) => !v)}
              aria-label="Toggle context"
            >
              {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          </div>

          <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 md:px-8">
            {empty && <EmptyHero />}

            <div className={`mx-auto w-full space-y-6 pb-36 ${empty ? "max-w-3xl" : "max-w-3xl pt-4"}`}>
              <AnimatePresence initial={false}>
                {messages.map((m, i) => {
                  const isLastAssistant =
                    m.role === "assistant" && i === messages.length - 1;
                  const body =
                    isLastAssistant && displayed && displayed.length < m.content.length
                      ? displayed
                      : m.content;
                  return (
                    <motion.div
                      key={`${m.role}-${i}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 140, damping: 22 }}
                      className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                    >
                      {m.role === "user" ? (
                        <div className="max-w-[85%] rounded-3xl bg-white px-5 py-3 text-[15px] leading-relaxed text-black shadow-sm">
                          {m.content}
                        </div>
                      ) : (
                        <div className="w-full max-w-none">
                          <div className="prose prose-invert prose-p:leading-relaxed prose-headings:tracking-tight prose-pre:bg-black/40 prose-table:text-sm max-w-none text-[15px] text-white/88">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                          </div>
                          {m.sources?.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {m.sources.slice(0, 6).map((s) => (
                                <span
                                  key={s}
                                  className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/40"
                                >
                                  {s.replace(/^SoDEX GET /, "").slice(0, 48)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {m.followUps?.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {m.followUps.map((f) => (
                                <button
                                  key={f}
                                  type="button"
                                  onClick={() => submit(f)}
                                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-xs text-emerald-100/80 transition hover:bg-emerald-400/10"
                                >
                                  {f} <ChevronRight className="h-3 w-3" />
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {ask.isPending && (
                <div className="flex items-center gap-3 text-sm text-white/50">
                  <StreamingDots />
                  Reading live SoDEX markets and your portfolio…
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          {/* Composer */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#050507] via-[#050507]/95 to-transparent pb-3 pt-16">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl px-4 md:px-8">
              {empty && (
                <div className="mb-4 space-y-3">
                  {Object.entries(GROUPS).map(([group, prompts]) => (
                    <div key={group}>
                      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">
                        {group}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {prompts.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => submit(p)}
                            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60 transition hover:border-emerald-400/25 hover:text-white"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-[1.75rem] border border-white/10 bg-[#0c0c12]/95 p-2 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
                <textarea
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit(input);
                    }
                  }}
                  placeholder="Ask about MAG7, liquidity, $20 routing, or a receipt…"
                  className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-3 py-3 text-[15px] text-white outline-none placeholder:text-white/30"
                />
                <Button
                  className="mb-1 h-11 w-11 shrink-0 rounded-2xl bg-emerald-400 p-0 text-black hover:bg-emerald-300"
                  disabled={ask.isPending || !input.trim()}
                  onClick={() => submit(input)}
                  aria-label="Send"
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2} />
                </Button>
              </div>
              <p className="mt-2 text-center text-[10px] text-white/25">
                Answers cite official SoDEX APIs. Path A settles vault tokens on ValueChain SoDEX, not Base SSI site.
              </p>
            </div>
          </div>
        </div>

        {/* Context panel ~28% */}
        <aside
          className={`${
            panelOpen ? "flex" : "hidden lg:flex"
          } w-full max-w-full flex-col border-l border-white/[0.06] bg-[#07070b]/70 backdrop-blur-xl lg:w-[min(28%,22rem)] lg:max-w-[22rem] ${
            panelOpen ? "" : "lg:hidden"
          } absolute inset-y-0 right-0 z-20 lg:static`}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-white/40">Context</span>
            <button
              type="button"
              className="text-white/40 hover:text-white"
              onClick={() => setPanelOpen(false)}
              aria-label="Collapse"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <section>
              <h3 className="mb-2 text-xs text-white/50">Portfolio snapshot</h3>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="font-mono text-lg text-white">
                  {totalUsd != null ? fmtUsd(totalUsd) : "—"}
                </div>
                <div className="mt-1 text-[11px] text-white/35">Live SoDEX balances only</div>
                <div className="mt-3 space-y-1.5">
                  {holdings.slice(0, 4).map((h: any) => (
                    <div key={h.symbol || h.asset} className="flex justify-between text-xs text-white/55">
                      <span>{h.symbol || h.asset}</span>
                      <span className="font-mono">{h.qty ?? h.quantity ?? h.balance ?? "—"}</span>
                    </div>
                  ))}
                  {!holdings.length && (
                    <p className="text-xs text-white/35">No holdings yet from official balances.</p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs text-white/50">Executable markets</h3>
              <div className="space-y-2">
                {board.slice(0, 6).map((m: any) => (
                  <div
                    key={m.symbol}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-white/80">
                        {String(m.symbol).replace(/_vUSDC$/, "")}
                      </span>
                      <span
                        className={`text-[10px] uppercase ${
                          m.executable ? "text-emerald-300/90" : "text-amber-200/80"
                        }`}
                      >
                        {m.executable ? "Live" : "Blocked"}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-white/40">
                      ask {m.bestAsk ?? "—"} · depth ${Number(m.askDepthUsd || 0).toFixed(0)} · score{" "}
                      {m.score}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs text-white/50">Suggested</h3>
              <div className="flex flex-col gap-1.5">
                {["Highest liquidity today", "Explain my last trade", "Safest SSI"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => submit(s)}
                    className="rounded-xl border border-white/[0.06] px-3 py-2 text-left text-xs text-white/60 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>

        {!panelOpen && (
          <button
            type="button"
            className="absolute right-3 top-3 z-10 hidden rounded-xl border border-white/10 bg-black/40 p-2 text-white/50 hover:text-white lg:block"
            onClick={() => setPanelOpen(true)}
            aria-label="Open context"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
