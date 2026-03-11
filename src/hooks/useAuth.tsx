import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "super_admin" | "admin" | "agent" | "tax_processor" | "client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: { full_name: string; organization_id: string | null; role: AppRole | null } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{
    full_name: string;
    organization_id: string | null;
    role: AppRole | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

const fetchUserData = async (userId: string) => {
  try {
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    
    const fetch = supabase
      .from("profiles")
      .select("full_name, organization_id, role")
      .eq("id", userId)
      .single()
      .then(({ data }) => data);

    const data = await Promise.race([fetch, timeout]);

    if (data) {
      setRole((data as any).role as AppRole);
      setProfile({
        full_name: (data as any).full_name,
        organization_id: (data as any).organization_id,
        role: (data as any).role as AppRole,
      });
    }
  } catch (err) {
    console.error("useAuth: unexpected error:", err);
    setRole(null);
    setProfile(null);
  }
};

  useEffect(() => {
    let initialDone = false;

    // onAuthStateChange fires immediately on mount with current session —
    // this replaces getSession() and avoids the race condition where
    // initialDone is still false when the listener fires.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!initialDone) {
          // First fire — this IS the initial session, handle it here
          initialDone = true;
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchUserData(session.user.id);
          }
          setLoading(false);
          return;
        }

        // Subsequent auth changes (login, logout, token refresh)
        setLoading(true);
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchUserData(session.user.id);
        } else {
          setRole(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);