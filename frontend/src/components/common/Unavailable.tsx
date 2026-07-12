import { EmptyState } from "@/components/common/EmptyState";
import { Inbox } from "lucide-react";

/** Back-compat wrapper — warmer empty states for parents. */
export function Unavailable({
  title = "Nothing here yet",
  detail,
  className = "",
}: {
  title?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <EmptyState
      title={title}
      detail={detail || "We'll show this as soon as real data arrives. We never invent numbers."}
      icon={Inbox}
      className={className}
    />
  );
}
