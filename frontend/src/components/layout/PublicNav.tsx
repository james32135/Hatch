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
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <NavLink to="/login" className={({ isActive }) => (isActive ? "text-white" : "hover:text-white")}>
            Sign in
          </NavLink>
        </nav>
        <Button asChild size="sm" className="bg-white text-black hover:bg-white/90">
          <Link to="/login">Get started</Link>
        </Button>
      </div>
    </header>
  );
}
