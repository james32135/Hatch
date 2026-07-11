import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="text-center">
        <div className="font-mono text-xs text-white/40">404</div>
        <h1 className="mt-2 text-2xl font-medium">Page not found</h1>
        <Link to="/" className="mt-6 inline-block text-sm text-white/60 hover:text-white">← Back to landing</Link>
      </div>
    </div>
  );
}
