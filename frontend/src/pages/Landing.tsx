import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight, Sparkles, ShieldCheck, Wallet, GraduationCap,
  TrendingUp, Lock, Zap, Users, Star, CheckCircle2, LineChart, Baby,
} from "lucide-react";
import PublicNav from "@/components/layout/PublicNav";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Landing() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get("/api/health", { auth: false }) });
  const backendDown = health.isError;
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.2]);

  return (
    <div className="min-h-screen bg-black text-white">
      <PublicNav />

      {backendDown && (
        <div className="border-b border-white/10 bg-[hsl(350_89%_60%/0.08)] py-2 text-center text-xs text-white/80">
          Backend is unreachable. Live data is temporarily unavailable.
        </div>
      )}

      {/* Hero */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div className="hatch-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        {/* Ambient orbs */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(199 89% 60% / 0.18), transparent)" }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-40 right-0 h-[400px] w-[400px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, hsl(142 71% 45% / 0.12), transparent)" }}
          animate={{ scale: [1.1, 1, 1.1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative mx-auto max-w-6xl px-6 pt-24 pb-32 md:pt-32">
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/60"
          >
            <Sparkles className="h-3.5 w-3.5" /> Family investing, made calm
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl font-medium tracking-tight md:text-7xl"
          >
            Instead of spending money,<br />
            <span className="text-white/50">build their future.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
            className="mt-6 max-w-xl text-base text-white/60 md:text-lg"
          >
            Set a weekly allowance plan. Parent-approved trades enter the shared family account, and your child learns from real markets in plain language.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <Button asChild size="lg" className="group bg-white text-black hover:bg-white/90">
              <Link to="/login">Get started <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-white/70 hover:text-white">
              <a href="#how">See how it works</a>
            </Button>
          </motion.div>

          {/* Animated hero visual */}
          <HeroVisual />

          {/* Live stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 md:grid-cols-4"
          >
            {[
              { k: "You", v: "Keep control" },
              { k: "Weekly", v: "Automatic investing" },
              { k: "AI", v: "Explains every move" },
              { k: "Kids", v: "Learn as they grow" },
            ].map((s, i) => (
              <div key={i} className="bg-black p-5">
                <div className="text-2xl font-medium tracking-tight">{s.k}</div>
                <div className="mt-1 text-xs text-white/50">{s.v}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
        <h2 className="mb-12 text-3xl font-medium tracking-tight md:text-4xl">How HATCH works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Wallet, title: "Connect securely", body: "Sign in with your wallet. You approve every investment." },
            { icon: Sparkles, title: "Set a weekly allowance", body: "Pick an amount and investing style. HATCH handles the rest." },
            { icon: GraduationCap, title: "Learn together", body: "Short lessons explain what changed and why, in plain language." },
          ].map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6"
            >
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <s.icon className="mb-4 h-5 w-5 text-white/70 transition-transform group-hover:scale-110" />
              <h3 className="mb-2 font-medium">{s.title}</h3>
              <p className="text-sm text-white/60">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Product preview */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="mb-3 text-3xl font-medium tracking-tight md:text-4xl">Every child. Every investment. One calm view.</h2>
          <p className="mb-10 max-w-xl text-sm text-white/60">See growth, next allowance, and lessons without the jargon.</p>
          <DashboardMock />
        </div>
      </section>

      {/* What they own */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="mb-3 text-3xl font-medium tracking-tight md:text-4xl">What they can invest in</h2>
          <p className="mb-10 max-w-xl text-sm text-white/60">Diversified index baskets designed for long-term learning. Returns are never guaranteed.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { t: "MAG7 index", d: "A diversified basket of leading digital assets.", tone: "hsl(199 89% 60%)" },
              { t: "USSI index", d: "A steadier allocation for balanced portfolios.", tone: "hsl(142 71% 45%)" },
              { t: "Earn", d: "Optional staking for variable rewards when you choose.", tone: "hsl(38 92% 55%)" },
            ].map((x, i) => (
              <motion.div
                key={x.t}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6"
              >
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity group-hover:opacity-100" style={{ background: x.tone, opacity: 0.15 }} />
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: x.tone }} />
                  <div className="font-mono text-sm text-white">{x.t}</div>
                </div>
                <p className="mt-3 text-sm text-white/60">{x.d}</p>
                <TokenSparkline color={x.tone} seed={i} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="mb-12 text-3xl font-medium tracking-tight md:text-4xl">Built for parents. Safe for kids.</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: Lock, t: "You stay in control", d: "Every investment needs your wallet approval. HATCH never holds your funds." },
              { icon: Zap, t: "Weekly on autopilot", d: "Approve once a week. Investing happens in seconds." },
              { icon: LineChart, t: "Real market exposure", d: "Diversified assets in the parent-managed family account." },
              { icon: GraduationCap, t: "Lessons that stick", d: "AI turns family-account moves into short, clear explanations." },
              { icon: ShieldCheck, t: "Independently verifiable", d: "Important actions are recorded so you can verify what happened." },
              { icon: Baby, t: "Kid-safe view", d: "Children can look and learn. They cannot move money." },
            ].map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.06 }}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20"
              >
                <f.icon className="mb-3 h-4 w-4 text-white/70" />
                <div className="text-sm font-medium">{f.t}</div>
                <p className="mt-1.5 text-xs text-white/50">{f.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <ShieldCheck className="mb-4 h-6 w-6 text-white/70" />
              <h2 className="text-3xl font-medium tracking-tight md:text-4xl">You stay in control</h2>
              <p className="mt-3 max-w-lg text-sm text-white/60">
                HATCH never holds your funds. Every investment needs your wallet approval, and important actions can be independently verified.
              </p>
            </div>
            <FlowDiagram />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-4xl font-medium tracking-tight md:text-6xl"
          >
            Start a family investing plan<br /><span className="text-white/50">this week.</span>
          </motion.h2>
          <p className="mx-auto mt-6 max-w-md text-sm text-white/60">Two minutes to onboard. One signature per allowance. A lifetime of compounding.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg" className="group bg-white text-black hover:bg-white/90">
              <Link to="/login">Get started <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/40">{children}</div>;
}

function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.35 }}
      className="mt-20 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent p-8"
    >
      <svg viewBox="0 0 800 260" className="h-64 w-full" fill="none">
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="hsl(199 89% 60%)" stopOpacity="0.35" />
            <stop offset="1" stopColor="hsl(199 89% 60%)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineG" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="hsl(199 89% 60%)" />
            <stop offset="1" stopColor="hsl(142 71% 55%)" />
          </linearGradient>
        </defs>

        {/* grid */}
        {[...Array(6)].map((_, i) => (
          <line key={i} x1="0" x2="800" y1={40 + i * 36} y2={40 + i * 36} stroke="white" strokeOpacity="0.04" />
        ))}

        {/* area fill */}
        <motion.path
          d="M 0 220 L 40 200 L 120 190 L 200 170 L 280 175 L 360 140 L 440 130 L 520 100 L 600 85 L 680 60 L 800 40 L 800 260 L 0 260 Z"
          fill="url(#areaG)"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 0.8 }}
        />
        {/* animated line */}
        <motion.path
          d="M 0 220 L 40 200 L 120 190 L 200 170 L 280 175 L 360 140 L 440 130 L 520 100 L 600 85 L 680 60 L 800 40"
          stroke="url(#lineG)" strokeWidth="2" fill="none" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, delay: 0.4, ease: "easeInOut" }}
        />
        {/* dots */}
        {[[40,200],[200,170],[360,140],[520,100],[680,60]].map(([x,y], i) => (
          <motion.circle
            key={i} cx={x} cy={y} r="4" fill="white"
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1 + i * 0.15, type: "spring", stiffness: 300 }}
          />
        ))}

        {/* Floating tags */}
        <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.3 }}>
          <rect x="600" y="30" width="120" height="26" rx="6" fill="hsl(0 0% 4%)" stroke="hsl(199 89% 60%)" strokeOpacity="0.5" />
          <text x="612" y="47" fill="white" fontSize="11" fontFamily="Geist Mono, monospace">+ $12.40 MAG7.ssi</text>
        </motion.g>
      </svg>
      <div className="mt-4 flex items-center justify-between text-xs text-white/40">
        <span>Wk 1</span><span>Wk 12</span><span>Wk 26</span><span>Wk 52</span>
      </div>
    </motion.div>
  );
}

function TokenSparkline({ color, seed }: { color: string; seed: number }) {
  const pts = [10, 14, 12, 18, 16, 22, 20, 26, 30, 28, 34, 40];
  const rot = (seed % 3) * 3;
  const d = pts.map((y, i) => `${i === 0 ? "M" : "L"} ${i * 20} ${50 - y - rot}`).join(" ");
  return (
    <svg viewBox="0 0 220 60" className="mt-6 h-12 w-full">
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }} transition={{ duration: 1.6, ease: "easeInOut" }}
      />
    </svg>
  );
}

function DashboardMock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.7 }}
      className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent"
    >
      {/* App chrome */}
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.02] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-4 font-mono text-[11px] text-white/40">hatch.family / app</span>
      </div>
      <div className="grid gap-px bg-white/5 md:grid-cols-[220px_1fr]">
        {/* sidebar */}
        <div className="space-y-1 bg-black p-4 text-xs">
          <div className="mb-4 flex items-center gap-2 text-white/80"><Sparkles className="h-3.5 w-3.5" /> HATCH</div>
          {["Home", "Children", "Activity", "Trading", "Security"].map((t, i) => (
            <div key={t} className={`rounded px-2.5 py-1.5 ${i === 0 ? "bg-white/10 text-white" : "text-white/40"}`}>{t}</div>
          ))}
        </div>
        {/* main */}
        <div className="space-y-4 bg-black p-6">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-widest text-white/40">Overview</div>
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(142_71%_45%)]" />
              <span className="text-[10px] text-white/40">live</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "Ava", age: 8, v: "$412.10", d: "+2.4%", tone: "hsl(142 71% 45%)" },
              { name: "Leo", age: 11, v: "$1,088.66", d: "+0.8%", tone: "hsl(199 89% 60%)" },
            ].map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm">{c.name} <span className="text-white/40">· {c.age}</span></div>
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${c.tone}20`, color: c.tone }}>{c.d}</span>
                </div>
                <div className="mt-2 text-2xl font-medium tracking-tight">{c.v}</div>
                <svg viewBox="0 0 200 40" className="mt-2 h-8 w-full">
                  <motion.path
                    d={i === 0 ? "M0 30 L 40 25 L 80 28 L 120 15 L 160 18 L 200 8" : "M0 22 L 40 26 L 80 18 L 120 22 L 160 14 L 200 10"}
                    stroke={c.tone} strokeWidth="1.5" fill="none"
                    initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
                    transition={{ duration: 1.4, delay: 0.4 + i * 0.1 }}
                  />
                </svg>
              </motion.div>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="text-white/60">Recent activity</span>
              <span className="text-white/40">7d</span>
            </div>
            <div className="space-y-2">
              {[
                { l: "MAG7.ssi buy", r: "+ $12.50" },
                { l: "USSI buy", r: "+ $12.50" },
                { l: "Lesson generated", r: "Ava" },
              ].map((r) => (
                <div key={r.l} className="flex items-center justify-between rounded-md bg-white/[0.02] px-3 py-2 text-xs">
                  <span className="text-white/70">{r.l}</span>
                  <span className="font-mono text-white/50">{r.r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function FlowDiagram() {
  const steps = [
    { l: "You approve", s: "Confirm in your wallet" },
    { l: "HATCH invests", s: "Places the order for you" },
    { l: "Family account updates", s: "Parent-owned holdings change" },
    { l: "Lessons arrive", s: "Plain-language explanations" },
  ];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="space-y-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.l}
            initial={{ opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-xs text-white/60">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="text-sm text-white">{s.l}</div>
              <div className="text-xs text-white/40">{s.s}</div>
            </div>
            <CheckCircle2 className="h-4 w-4 text-[hsl(142_71%_55%)]" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
