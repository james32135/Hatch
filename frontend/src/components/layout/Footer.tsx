import { API_BASE } from "@/lib/api";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 text-xs text-white/40">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 sm:flex-row sm:items-center">
        <div>© {new Date().getFullYear()} HATCH — Your child's first portfolio.</div>
        <div className="flex items-center gap-4">
          <a href="https://github.com/james32135/Hatch" target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a>
          <a href={`${API_BASE}/api/health`} target="_blank" rel="noreferrer" className="hover:text-white">API health</a>
        </div>
      </div>
    </footer>
  );
}
