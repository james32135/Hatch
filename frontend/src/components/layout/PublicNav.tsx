import { Link, NavLink } from "react-router-dom";
import HatchLogo from "@/components/common/HatchLogo";
import { Button } from "@/components/ui/button";

export default function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link to="/" className="text-white">
          <HatchLogo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/60 sm:flex">
          <NavLink to="/judges" className={({ isActive }) => isActive ? "text-white" : "hover:text-white"}>Judges</NavLink>
          <NavLink to="/diag" className={({ isActive }) => isActive ? "text-white" : "hover:text-white"}>Diagnostics</NavLink>
          <a href="https://github.com/james32135/Hatch" target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a>
        </nav>
        <Button asChild size="sm" className="bg-white text-black hover:bg-white/90">
          <Link to="/login">Get started →</Link>
        </Button>
      </div>
    </header>
  );
}
