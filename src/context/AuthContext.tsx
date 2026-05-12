import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { ModuleKey } from "@/lib/modules";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  status: "pending" | "active";
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  modules: Set<ModuleKey>;
  hasModule: (key: ModuleKey) => boolean;
  loginTime: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setLoginTime: (t: string) => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modules, setModules] = useState<Set<ModuleKey>>(new Set());
  const [loginTime, setLoginTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const { data: p } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    setProfile(p as Profile | null);
    const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const admin = !!r?.some((x) => x.role === "admin");
    setIsAdmin(admin);
    const { data: m } = await supabase.from("user_module_access").select("module_key").eq("user_id", uid);
    setModules(new Set((m ?? []).map((x: any) => x.module_key as ModuleKey)));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id).finally(() => setLoading(false)), 0);
      } else {
        setProfile(null); setIsAdmin(false); setModules(new Set()); setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadProfile(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setLoginTime(null);
  };

  const refreshProfile = async () => { if (user) await loadProfile(user.id); };

  const hasModule = (key: ModuleKey) => isAdmin || modules.has(key);

  return (
    <Ctx.Provider value={{ user, session, profile, isAdmin, modules, hasModule, loginTime, loading, signOut, refreshProfile, setLoginTime }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
