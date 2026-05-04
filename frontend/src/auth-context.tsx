import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Auth, getToken, setToken, User } from "./api";

type State = {
  status: "checking" | "authed" | "guest";
  user: User | null;
};

type Ctx = State & {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "checking", user: null });

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setState({ status: "guest", user: null });
      return;
    }
    try {
      const me = await Auth.me();
      setState({ status: "authed", user: me });
    } catch {
      await setToken(null);
      setState({ status: "guest", user: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await Auth.login(email, password);
    await setToken(res.access_token);
    setState({ status: "authed", user: res.user });
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await Auth.register(email, password, name);
    await setToken(res.access_token);
    setState({ status: "authed", user: res.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await Auth.logout();
    } catch {}
    await setToken(null);
    setState({ status: "guest", user: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
