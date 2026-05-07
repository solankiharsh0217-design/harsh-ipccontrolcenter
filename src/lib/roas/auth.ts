import { useAuth } from "@/context/AuthContext";

// Adapter that maps the Hub's AuthContext to the role flags the ROAS pages expect.
export function useRoasAuth() {
  const { user, profile, isAdmin } = useAuth();
  const active = !!profile && profile.status === "active";
  return {
    user,
    isAdmin,
    canEdit: isAdmin || active,
    canSync: isAdmin || active,
  };
}
