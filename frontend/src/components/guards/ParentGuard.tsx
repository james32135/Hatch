import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

export default function ParentGuard({ children }: { children: React.ReactNode }) {
  const { isAuthed, isParent } = useSession();
  const loc = useLocation();
  if (!isAuthed || !isParent) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
