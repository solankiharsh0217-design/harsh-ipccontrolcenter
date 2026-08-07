import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ReactNode } from "react";
import { LoadingState } from "@/components/ui-bits";
import type { ModuleKey } from "@/lib/modules";

export default function ProtectedRoute({ children, adminOnly, moduleKey }: { children: ReactNode; adminOnly?: boolean; moduleKey?: ModuleKey }) {
  const { user, profile, isAdmin, hasModule, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingState /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (profile && profile.status === "pending" && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="font-serif text-2xl mb-3">Awaiting approval</div>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">Your access request is under review by the admin. You'll receive an email once approved.</p>
        </div>
      </div>
    );
  }
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (moduleKey && !hasModule(moduleKey)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="font-serif text-2xl mb-3">Access restricted</div>
          <p className="font-sans text-sm text-muted-foreground leading-relaxed">You don't have access to this module. Please contact an admin to request access.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
