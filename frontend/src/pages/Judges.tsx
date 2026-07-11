import PublicNav from "@/components/layout/PublicNav";
import Footer from "@/components/layout/Footer";
import { API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const proofs = [
  { label: "Backend health", path: "/api/health" },
  { label: "Public config", path: "/api/config" },
  { label: "ValueChain contracts (mainnet)", path: "/api/valuechain/contracts?network=mainnet" },
  { label: "SSI capabilities", path: "/api/ssi/capabilities" },
  { label: "SoDEX symbols", path: "/api/sodex/markets/symbols" },
  { label: "AI provider health", path: "/api/ai/health" },
];

export default function Judges() {
  return (
    <div className="min-h-screen bg-black text-white">
      <PublicNav />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-medium tracking-tight">HATCH — for judges</h1>
        <p className="mt-3 text-white/60">Greenlight for on-chain kids. Non-custodial. Educational. Live on production.</p>

        <section className="mt-10 space-y-3 text-sm text-white/80">
          <p>• Parent turns weekly allowance into <span className="font-mono text-white">MAG7.ssi</span> + <span className="font-mono text-white">USSI</span> on SoDEX Vault.</p>
          <p>• Every trade signed EIP-712 by parent wallet — backend never custodies keys.</p>
          <p>• AI Education Agent turns live market moves into age-appropriate lessons for a view-only child.</p>
          <p>• Immutable audit log on ValueChain (mainnet + testnet).</p>
          <p>• Production API is live; no mock data anywhere in this app.</p>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-xl font-medium">Live proof</h2>
          <div className="grid gap-2">
            {proofs.map((p) => (
              <a key={p.path} href={`${API_BASE}${p.path}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 hover:bg-white/[0.05]">
                <span className="text-sm">{p.label}</span>
                <span className="flex items-center gap-2 font-mono text-xs text-white/50">
                  {p.path} <ExternalLink className="h-3.5 w-3.5" />
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-medium">GitHub</h3>
            <p className="mt-1 text-sm text-white/60">Full backend + this frontend.</p>
            <Button asChild variant="ghost" className="mt-3 px-0 text-white hover:bg-transparent"><a href="https://github.com/james32135/Hatch" target="_blank" rel="noreferrer">Open repository →</a></Button>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-medium">ValueChain explorers</h3>
            <div className="mt-2 space-y-1 text-sm">
              <a className="block text-white/70 hover:text-white" href="https://main-scan.valuechain.xyz" target="_blank" rel="noreferrer">Mainnet · main-scan.valuechain.xyz</a>
              <a className="block text-white/70 hover:text-white" href="https://test-scan.valuechain.xyz" target="_blank" rel="noreferrer">Testnet · test-scan.valuechain.xyz</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
