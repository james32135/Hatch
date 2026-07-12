import { useEffect, useState, useCallback } from "react";
import { getJwt, getRole, clearJwt, getProfile, setProfile as apiSetProfile, HatchProfile } from "@/lib/api";

export function useSession() {
  const [jwt, setJwtState] = useState<string | null>(() => getJwt());
  const [role, setRoleState] = useState<"parent" | "child" | null>(() => getRole());
  const [profile, setProfileState] = useState<HatchProfile>(() => getProfile());

  useEffect(() => {
    const sync = () => {
      setJwtState(getJwt());
      setRoleState(getRole());
    };
    const onProfile = () => setProfileState(getProfile());
    window.addEventListener("hatch:auth", sync);
    window.addEventListener("hatch:profile", onProfile);
    window.addEventListener("storage", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hatch:auth", sync);
      window.removeEventListener("hatch:profile", onProfile);
      window.removeEventListener("storage", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const signOut = useCallback(() => clearJwt(), []);
  const setProfile = useCallback((p: HatchProfile) => apiSetProfile(p), []);

  return { jwt, role, isAuthed: !!jwt, isParent: role === "parent", isChild: role === "child", profile, setProfile, signOut };
}
