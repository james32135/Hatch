import { Outlet, NavLink, Link } from "react-router-dom";
import HatchLogo from "@/components/common/HatchLogo";
import { useSession } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function ChildShell() {
  const { signOut } = useSession();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-1.5 text-sm ${isActive ? "bg-white text-black" : "text-white/60 hover:text-white"}`;
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/child" className="text-white"><HatchLogo /></Link>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /></Button>
        </div>
        <nav className="mx-auto flex max-w-3xl items-center gap-1 px-6 pb-3">
          <NavLink to="/child" end className={tab}>Today</NavLink>
          <NavLink to="/child/why" className={tab}>Why?</NavLink>
          <NavLink to="/child/learn" className={tab}>Learn</NavLink>
          <NavLink to="/child/portfolio" className={tab}>Portfolio</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8"><Outlet /></main>
    </div>
  );
}
