import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

export default function ChildGuard({ children }: { children: React.ReactNode }) {
  const { isAuthed, isChild } = useSession();
  if (!isAuthed || !isChild) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
