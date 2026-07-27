import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Person } from "@/lib/db-types";

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  person: Person | null;
  isAdmin: boolean;
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadProfile = async (uid: string) => {
    const [personRes, roleRes] = await Promise.all([
      supabase.from("people").select("*").eq("auth_user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle(),
    ]);
    setPerson((personRes.data as Person) ?? null);
    setIsAdmin(!!roleRes.data);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Link de "recuperar senha" ou "primeiro acesso via convite": o Supabase já
      // cria uma sessão válida, mas a pessoa ainda precisa DEFINIR a senha antes
      // de poder navegar pelo app — por isso não tratamos isso como login normal.
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
      }
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setPerson(null);
        setIsAdmin(false);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        person,
        isAdmin,
        passwordRecovery,
        clearPasswordRecovery: () => setPasswordRecovery(false),
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
