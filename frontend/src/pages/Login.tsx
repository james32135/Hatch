import PublicNav from "@/components/layout/PublicNav";
import Footer from "@/components/layout/Footer";
import { HeroSilkBackdrop } from "@/components/backgrounds/HeroSilkBackdrop";
import { ConnectAndSignIn } from "@/components/common/ConnectAndSignIn";

export default function Login() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <HeroSilkBackdrop className="opacity-90" />
      <div className="relative z-10">
        <PublicNav />
        <main className="mx-auto flex max-w-md flex-col px-6 py-20">
          <h1 className="text-3xl font-medium tracking-tight">Sign in to HATCH</h1>
          <p className="mt-2 text-sm text-white/60">
            Connect your wallet, then sign a message to prove it&apos;s you. No transaction, no gas.
          </p>
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 p-5 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md">
            <ConnectAndSignIn />
          </div>
          <p className="mt-6 text-xs text-white/40">
            HATCH is software for parents managing their own crypto with educational features for children.
            Not a custodial minor account.
          </p>
        </main>
        <Footer />
      </div>
    </div>
  );
}
