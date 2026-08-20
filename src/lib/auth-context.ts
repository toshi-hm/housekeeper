import type { Session } from "@supabase/supabase-js";
import { createContext, useContext } from "react";

export interface AuthContextValue {
  session: Session | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuthSession = (): Session | null => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthSession must be used within AuthProvider");
  }
  return ctx.session;
};
