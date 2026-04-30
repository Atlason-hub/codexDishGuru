import React from "react";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { supabase } from "./supabaseClient";

export type Role = "admin" | "viewer";
const ADMIN_USERS_TABLE = "admin_users";

type AuthContextValue = {
  user: { id: string; email: string | null } | null;
  role: Role | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  confirmPassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

async function fetchAdminAccess(
  email: string | null
): Promise<{ role: Role | null; allowed: boolean }> {
  if (!email) {
    return { role: null, allowed: false };
  }

  const { data, error } = await supabase
    .from(ADMIN_USERS_TABLE)
    .select("role, status")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    return { role: null, allowed: false };
  }

  const role = (data.role as Role | undefined) ?? null;
  const status = String(data.status ?? "");
  return {
    role,
    allowed: Boolean(role) && status === "active"
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthContextValue["user"]>(null);
  const [role, setRole] = React.useState<Role | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    const safetyTimeout = window.setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 3000);
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (mounted && session?.user) {
          const adminAccess = await fetchAdminAccess(session.user.email ?? null);
          if (adminAccess.allowed) {
            setUser({ id: session.user.id, email: session.user.email ?? null });
            setRole(adminAccess.role);
          } else {
            await supabase.auth.signOut({ scope: "local" });
            setUser(null);
            setRole(null);
          }
        }
      } catch {
        // Ignore session errors and allow app to render login.
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const adminAccess = await fetchAdminAccess(session.user.email ?? null);
          if (adminAccess.allowed) {
            setUser({ id: session.user.id, email: session.user.email ?? null });
            setRole(adminAccess.role);
          } else {
            await supabase.auth.signOut({ scope: "local" });
            setUser(null);
            setRole(null);
          }
        } else {
          setUser(null);
          setRole(null);
        }
        if (mounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      window.clearTimeout(safetyTimeout);
      subscription.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }

    const adminAccess = await fetchAdminAccess(email);
    if (!adminAccess.allowed) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error("This user is not allowed to access the admin website.");
    }
  };

  const logout = async () => {
    setUser(null);
    setRole(null);

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      throw new Error(error.message);
    }
  };

  const confirmPassword = async (password: string) => {
    if (!user?.email) {
      throw new Error("Missing user email. Please log in again.");
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase auth is not configured.");
    }

    const verificationClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { error } = await verificationClient.auth.signInWithPassword({
      email: user.email,
      password
    });

    if (error) {
      throw new Error("Incorrect password.");
    }

    await verificationClient.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, login, confirmPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
