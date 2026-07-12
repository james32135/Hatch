import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { api, streamAgent, type AgentProgressPayload } from "@/lib/api";
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

const GROUPS: { id: string; label: string; prompts: string[] }[] = [
  {
    id: "investment",
    label: "Investment",
    prompts: [
      "Best investment today",
      "Where should I invest $20",
      "Safest SSI",
      "Compare MAG7 vs BTC",
    ],
  },
  {
    id: "markets",
    label: "Markets",
    prompts: [
      "Highest liquidity today",
      "Market summary",
      "Compare MAG7 vs USSI liquidity",
      "Should I buy MAG7 today?",
    ],
  },
  {
    id: "portfolio",
    label: "Portfolio",
    prompts: [
      "Explain my portfolio",
      "Explain my last trade",
      "Why wasn't my last order filled?",
      "Risk report",
    ],
  },
  {
    id: "learning",
    label: "Learning",
    prompts: [
      "Teach my child diversification",
      "Explain dollar-cost averaging",
      "Compare SSI indexes",
    ],
  },
];

function StreamingDots() {
  return (
    <span className="inline-flex gap-1 px-1" aria-hidden>
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

const STEP_ORDER = ["markets", "portfolio", "orders", "context", "thinking", "writing"] as const;

function AgentRunProgress({
  steps,
  thinking,
  streaming,
}: {
  steps: Record<string, AgentProgressPayload>;
  thinking: string;
  streaming: string;
}) {
  const ordered = STEP_ORDER.map((id) => steps[id]).filter(Boolean) as AgentProgressPayload[];
  const visible = ordered.length
    ? ordered
    : [{ step: "markets", label: "Connecting to Copilot…", status: "active" as const }];

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-white/45">
        <StreamingDots />
        <span>Live SoDEX read in progress</span>
      </div>
      <ul className="space-y-1.5">
        {visible.map((s) => (
          <li key={s.step} className="flex items-start gap-2 text-[13px]">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                s.status === "done"
                  ? "bg-emerald-400"
                  : s.status === "active"
                    ? "bg-sky-400 animate-pulse"
                    : "bg-white/20"
              }`}
            />
            <span className={s.status === "done" ? "text-white/55" : "text-white/80"}>
              {s.label}
              {s.detail ? (
                <span className="ml-1.5 text-[11px] text-white/35">· {s.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {thinking && !streaming && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-white/30">Thinking</div>
          <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-white/45">{thinking}</p>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  activeGroup,
  onGroup,
  onPrompt,
}: {
  activeGroup: string;
  onGroup: (id: string) => void;
  onPrompt: (text: string) => void;
}) {
  const group = GROUPS.find((g) => g.id === activeGroup) ?? GROUPS[0]!;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-1 pb-8 pt-6 text-center md:pt-10">
      <motion.div
        className="relative mb-8 flex h-16 w-16 items-center justify-center"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-emerald-400/15 blur-xl"
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/20 to-sky-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Sparkles className="h-6 w-6 text-emerald-300" strokeWidth={1.5} />
        </span>
      </motion.div>

      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-300/70">
        Investment Copilot
      </p>
      <h1 className="mt-3 max-w-lg text-balance text-3xl font-semibold tracking-tight text-white md:text-[2.5rem] md:leading-[1.15]">
        Ask about investing for your family
      </h1>
      <p className="mt-3 max-w-md text-pretty text-sm leading-relaxed text-white/45 md:text-[15px]">
        Live SoDEX books, wallet balances, and real receipts. Nothing invented.
      </p>

      <div className="mt-10 w-full">
        <div
          className="mb-4 flex flex-wrap justify-center gap-1.5"
          role="tablist"
          aria-label="Prompt categories"
        >
          {GROUPS.map((g) => {
            const on = g.id === activeGroup;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onGroup(g.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                  on
                    ? "bg-white text-black"
                    : "border border-white/10 bg-transparent text-white/50 hover:border-white/20 hover:text-white/80"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-2" role="tabpanel">
          {group.prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPrompt(p)}
              className="rounded-full border border-white/[0.09] bg-white/[0.035] px-3.5 py-2 text-left text-[13px] text-white/65 transition hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-white"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Agent() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState("investment");
  const [running, setRunning] = useState(false);
  const [runSteps, setRunSteps] = useState<Record<string, AgentProgressPayload>>({});
  const [thinking, setThinking] = useState("");
  const [streaming, setStreaming] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

  const submit = async (text: string) => {
    const t = text.trim();
    if (!t || running) return;
    setInput("");

    const nextMsgs: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(nextMsgs);
    setRunning(true);
    setRunSteps({});
    setThinking("");
    setStreaming("");

    const notionalMatch = t.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
    const notionalUsd = notionalMatch ? Number(notionalMatch[1]) : undefined;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await streamAgent(
        {
          childId,
          notionalUsd: Number.isFinite(notionalUsd) ? notionalUsd : undefined,
          messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
        },
        {
          onProgress: (p) => {
            setRunSteps((prev) => ({ ...prev, [p.step]: p }));
          },
          onThinking: (delta) => {
            setThinking((prev) => prev + delta);
          },
          onToken: (delta) => {
            setStreaming((prev) => prev + delta);
          },
          onDone: (data) => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: data.content,
                sources: data.sources,
                followUps: data.followUps,
                marketsTop: data.marketsTop as Msg["marketsTop"],
              },
            ]);
            setStreaming("");
            setThinking("");
            setRunSteps({});
          },
          onError: (message) => {
            toast.error(message || "Copilot unavailable");
          },
        },
        ac.signal,
      );
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast.error(e?.message || "Copilot unavailable");
      }
    } finally {
      setRunning(false);
      setStreaming("");
      setThinking("");
      setRunSteps({});
      abortRef.current = null;
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, thinking, running, runSteps]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const board = lastAssistant?.marketsTop?.length
    ? lastAssistant.marketsTop
    : markets.data?.markets?.filter((m: any) => m.executable).slice(0, 5) || [];

  const holdings = portfolio.data?.holdings || [];
  const totalUsd = portfolio.data?.totalUsd ?? portfolio.data?.performance?.currentUsd;
  const empty = messages.length === 0;

  return (
    <div
      data-agent-page
      className="relative -mx-5 flex h-[calc(100dvh-5.5rem)] flex-col overflow-hidden md:-mx-6 md:h-[calc(100dvh-4.75rem)]"
    >
      <div className="flex min-h-0 flex-1">
        {/* Chat column */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 md:px-6">
            <div className="flex items-center gap-2 text-sm text-white/55">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300/90" strokeWidth={1.5} />
              <span>Copilot</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-white/45 hover:text-white"
              onClick={() => setPanelOpen((v) => !v)}
              aria-label={panelOpen ? "Hide context" : "Show context"}
            >
              {panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
              <span className="hidden text-xs sm:inline">Context</span>
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-6">
            {empty ? (
              <EmptyState
                activeGroup={activeGroup}
                onGroup={setActiveGroup}
                onPrompt={submit}
              />
            ) : (
              <div className="mx-auto w-full max-w-2xl space-y-7 py-4 pb-6">
                <AnimatePresence initial={false}>
                  {messages.map((m, i) => (
                      <motion.div
                        key={`${m.role}-${i}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 160, damping: 24 }}
                        className={m.role === "user" ? "flex justify-end" : "block"}
                      >
                        {m.role === "user" ? (
                          <div className="max-w-[min(100%,36rem)] rounded-3xl bg-white px-4 py-2.5 text-[15px] leading-relaxed text-black">
                            {m.content}
                          </div>
                        ) : (
                          <div>
                            <div className="prose prose-invert prose-p:my-3 prose-p:leading-relaxed prose-headings:mb-2 prose-headings:mt-5 prose-headings:tracking-tight prose-pre:rounded-xl prose-pre:bg-black/50 prose-table:text-sm max-w-none text-[15px] text-white/88">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                            </div>
                            {m.sources?.length ? (
                              <div className="mt-4 flex flex-wrap gap-1.5">
                                {m.sources.slice(0, 5).map((s) => (
                                  <span
                                    key={s}
                                    className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/35"
                                  >
                                    {s.replace(/^SoDEX GET /, "").slice(0, 40)}
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
                                    className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-1.5 text-xs text-emerald-100/75 transition hover:bg-emerald-400/10"
                                  >
                                    {f}
                                    <ChevronRight className="h-3 w-3" />
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </motion.div>
                    ))}
                </AnimatePresence>
                {running && !streaming && (
                  <AgentRunProgress
                    steps={runSteps}
                    thinking={thinking}
                    streaming={streaming}
                  />
                )}
                {streaming && (
                  <div>
                    <div className="prose prose-invert prose-p:my-3 prose-p:leading-relaxed max-w-none text-[15px] text-white/88">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
                    </div>
                    <span className="mt-1 inline-block h-4 w-0.5 animate-pulse bg-emerald-300/80" />
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {/* Composer — flex footer, never overlays hero */}
          <div className="shrink-0 border-t border-white/[0.05] bg-[#050507]/90 px-4 pb-4 pt-3 backdrop-blur-md md:px-6 md:pb-5">
            <div className="mx-auto w-full max-w-2xl">
              <div className="flex items-end gap-2 rounded-[1.5rem] border border-white/[0.1] bg-[#0d0d12] p-1.5 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)]">
                <textarea
                  ref={textareaRef}
                  value={input}
                  rows={1}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit(input);
                    }
                  }}
                  placeholder="Ask about MAG7, liquidity, $20 routing…"
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3.5 py-3 text-[15px] leading-snug text-white outline-none placeholder:text-white/30"
                />
                <Button
                  className="mb-0.5 h-10 w-10 shrink-0 rounded-2xl bg-emerald-400 p-0 text-black hover:bg-emerald-300 disabled:opacity-40"
                  disabled={running || !input.trim()}
                  onClick={() => submit(input)}
                  aria-label="Send"
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
                </Button>
              </div>
              <p className="mt-2 text-center text-[10px] leading-snug text-white/25">
                Grounded in official SoDEX APIs. Path A uses vault tokens on ValueChain SoDEX.
              </p>
            </div>
          </div>
        </section>

        {/* Context — optional, no duplicate prompts */}
        <AnimatePresence initial={false}>
          {panelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 288, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 32 }}
              className="hidden h-full shrink-0 overflow-hidden border-l border-white/[0.06] bg-[#07070b]/80 backdrop-blur-xl md:block"
            >
              <div className="flex h-full w-72 flex-col">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
                    Context
                  </span>
                  <button
                    type="button"
                    className="rounded-lg p-1 text-white/35 hover:bg-white/[0.04] hover:text-white"
                    onClick={() => setPanelOpen(false)}
                    aria-label="Close context"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
                  <section>
                    <h3 className="mb-2 text-[11px] text-white/40">Portfolio</h3>
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                      <div className="font-mono text-xl tracking-tight text-white">
                        {totalUsd != null ? fmtUsd(totalUsd) : "—"}
                      </div>
                      <p className="mt-1 text-[11px] text-white/30">Live SoDEX balances</p>
                      <div className="mt-3 space-y-2">
                        {holdings.slice(0, 4).map((h: any) => (
                          <div
                            key={h.symbol || h.asset}
                            className="flex justify-between gap-2 text-xs text-white/55"
                          >
                            <span className="truncate">{h.symbol || h.asset}</span>
                            <span className="shrink-0 font-mono text-white/70">
                              {h.qty ?? h.quantity ?? h.balance ?? "—"}
                            </span>
                          </div>
                        ))}
                        {!holdings.length && (
                          <p className="text-xs text-white/30">No holdings yet.</p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-[11px] text-white/40">Executable markets</h3>
                    <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
                      {board.length === 0 && (
                        <p className="px-3 py-4 text-xs text-white/30">Scanning…</p>
                      )}
                      {board.slice(0, 5).map((m: any, idx: number) => (
                        <div
                          key={m.symbol}
                          className={`px-3 py-2.5 ${
                            idx > 0 ? "border-t border-white/[0.05]" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-white/80">
                              {String(m.symbol).replace(/_vUSDC$/, "")}
                            </span>
                            <span
                              className={`shrink-0 text-[9px] uppercase tracking-wide ${
                                m.executable ? "text-emerald-300/85" : "text-amber-200/70"
                              }`}
                            >
                              {m.executable ? "Live" : "Blocked"}
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-white/35">
                            {m.bestAsk ?? "—"} · ${Number(m.askDepthUsd || 0).toFixed(0)} ·{" "}
                            {m.score}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile context sheet */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close"
              onClick={() => setPanelOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0a0a0f] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-white/70">Context</span>
                <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close">
                  <PanelRightClose className="h-4 w-4 text-white/40" />
                </button>
              </div>
              <div className="mb-4 font-mono text-2xl text-white">
                {totalUsd != null ? fmtUsd(totalUsd) : "—"}
              </div>
              <p className="mb-4 text-xs text-white/35">Live SoDEX portfolio</p>
              <div className="space-y-2">
                {board.slice(0, 5).map((m: any) => (
                  <div
                    key={m.symbol}
                    className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2 text-xs"
                  >
                    <span className="text-white/75">
                      {String(m.symbol).replace(/_vUSDC$/, "")}
                    </span>
                    <span className="font-mono text-white/40">
                      ${Number(m.askDepthUsd || 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
