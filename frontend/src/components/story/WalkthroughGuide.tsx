import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "hatch.walkthrough.v1";

const STEPS = [
  {
    id: "connect",
    title: "Connect your wallet",
    body: "You stay in control. HATCH never holds your trading keys.",
    to: "/app/settings",
    cta: "Open settings",
  },
  {
    id: "plan",
    title: "Set a weekly allowance",
    body: "Turn pocket money into a quiet habit that compounds over years.",
    to: "/app/children",
    cta: "Choose a child",
  },
  {
    id: "approve",
    title: "Approve in your wallet",
    body: "Each investment needs your signature before anything moves.",
    to: "/app/trading",
    cta: "Trading setup",
  },
  {
    id: "trade",
    title: "Watch the trade land",
    body: "Orders go to SoDEX. Their portfolio updates with real holdings.",
    to: "/app",
    cta: "Back home",
  },
  {
    id: "lesson",
    title: "Read the lesson",
    body: "Short explanations tied to what actually changed in the portfolio.",
    to: "/app/children",
    cta: "Open children",
  },
  {
    id: "record",
    title: "See the public record",
    body: "Confirmations and contracts live in Transparency, with explorer links.",
    to: "/app/transparency",
    cta: "Transparency",
  },
] as const;

export function WalkthroughGuide() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const location = useLocation();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "done") return;
      // Soft prompt once after first visit to app
      if (!raw && location.pathname.startsWith("/app")) {
        const t = window.setTimeout(() => setOpen(true), 1200);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, [location.pathname]);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const current = STEPS[step];

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="fixed bottom-20 right-4 z-[40] flex items-center gap-2 rounded-full border border-white/15 bg-[#0c0c10]/95 px-3.5 py-2.5 text-xs text-white/80 shadow-lg backdrop-blur-md hover:bg-white/10 md:bottom-6"
        aria-label="How HATCH works"
      >
        <Sparkles className="h-3.5 w-3.5 text-sky-300" />
        How HATCH works
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 160, damping: 20 }}
            className="fixed bottom-32 right-4 z-[40] w-[min(100vw-2rem,360px)] rounded-2xl border border-white/12 bg-[#0c0c10]/96 p-4 shadow-2xl backdrop-blur-xl md:bottom-20"
            role="dialog"
            aria-label="Product walkthrough"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/35">
                  {step + 1} of {STEPS.length}
                </div>
                <div className="mt-1 text-sm font-medium text-white">{current.title}</div>
              </div>
              <button type="button" onClick={finish} className="rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/55">{current.body}</p>

            <div className="mt-3 flex h-1 gap-1">
              {STEPS.map((_, i) => (
                <div key={i} className={`h-full flex-1 rounded-full ${i <= step ? "bg-sky-400/70" : "bg-white/10"}`} />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-white text-black hover:bg-white/90">
                <Link to={current.to} onClick={() => (step >= STEPS.length - 1 ? finish() : setStep((s) => s + 1))}>
                  {current.cta}
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
              {step < STEPS.length - 1 ? (
                <Button size="sm" variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={() => setStep((s) => s + 1)}>
                  Next
                </Button>
              ) : (
                <Button size="sm" variant="secondary" className="bg-white/5 hover:bg-white/10" onClick={finish}>
                  Done
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
