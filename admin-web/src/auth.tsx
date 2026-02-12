import React from "react";
import { login as apiLogin } from "./api";

const TOKEN_KEY = "dg_admin_token";

type AuthContextValue = {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(
    () => window.localStorage.getItem(TOKEN_KEY)
  );

  const login = async (email: string, password: string) => {
    const result = await apiLogin({ email, password });
    window.localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
  };

  const logout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout }}>
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
