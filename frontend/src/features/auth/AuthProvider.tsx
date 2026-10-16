import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { AuthService } from "./services/auth";
import type { AuthSession } from "./session";

const AuthContext = createContext<{ session: AuthSession; service: AuthService } | null>(null);

export function AuthProvider({ session, service, children }: { session: AuthSession; service: AuthService; children: ReactNode }) {
  useEffect(() => {
    const check = () => session.expireIfNeeded();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [session]);
  return <AuthContext.Provider value={{ session, service }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  const state = useSyncExternalStore(context.session.subscribe, context.session.getSnapshot, context.session.getSnapshot);
  return { ...context, ...state };
}
