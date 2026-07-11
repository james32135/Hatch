import { useAccount, useConnect, useDisconnect, useSignMessage, useChainId } from "wagmi";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { api, setJwt } from "@/lib/api";
import { SiweMessage } from "siwe";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ConnectAndSignIn() {
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function handleSign() {
    if (!address) return;
    setBusy(true);
    try {
      const nonceRes = await api.get<{ nonce: string; statement: string; domain: string; uri: string; chainId?: number }>(
        `/api/auth/nonce?address=${address}`,
        { auth: false },
      );
      const msg = new SiweMessage({
        domain: nonceRes.domain || window.location.host,
        address,
        statement: nonceRes.statement || "Sign in to HATCH",
        uri: nonceRes.uri || window.location.origin,
        version: "1",
        chainId: nonceRes.chainId ?? chainId ?? 1,
        nonce: nonceRes.nonce,
      });
      const message = msg.prepareMessage();
      const signature = await signMessageAsync({ message, account: address });
      const verified = await api.post<{ token: string; user: { role: "parent" } }>(
        "/api/auth/verify",
        { message, signature },
        { auth: false },
      );
      setJwt(verified.token, "parent");
      toast.success("Welcome to HATCH");
      // Route to onboarding or dashboard based on children
      try {
        const me = await api.get<{ children?: any[] }>("/api/auth/me");
        nav(me.children && me.children.length > 0 ? "/app" : "/app/onboarding", { replace: true });
      } catch {
        nav("/app", { replace: true });
      }
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col gap-2">
        {connectors.map((c) => (
          <Button
            key={c.uid}
            variant="secondary"
            className="w-full justify-between bg-white/5 hover:bg-white/10 border border-white/10"
            onClick={() => connectAsync({ connector: c }).catch((e) => toast.error(e?.message || "Connect failed"))}
            disabled={connecting}
          >
            <span>{c.name}</span>
            {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 font-mono text-xs text-white/70">
        {address}
      </div>
      <div className="flex gap-2">
        <Button className="flex-1 bg-white text-black hover:bg-white/90" onClick={handleSign} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in with Ethereum"}
        </Button>
        <Button variant="ghost" className="text-white/60 hover:text-white" onClick={() => disconnect()}>
          Disconnect
        </Button>
      </div>
      <p className="text-xs text-white/40">You'll sign a message. No transaction. No gas.</p>
    </div>
  );
}
