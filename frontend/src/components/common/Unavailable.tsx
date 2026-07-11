import { AlertCircle } from "lucide-react";

export function Unavailable({ title = "Unavailable", detail, className = "" }: { title?: string; detail?: string; className?: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm ${className}`}>
      <AlertCircle className="h-4 w-4 mt-0.5 text-white/50" />
      <div>
        <div className="font-medium text-white/90">{title}</div>
        <div className="text-white/50">{detail || "This data isn't available right now. We're not going to guess."}</div>
      </div>
    </div>
  );
}
