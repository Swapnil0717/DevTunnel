"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentUser, logoutRequest, startGitHubLogin } from "@/lib/auth-client";
import type { AuthContextValue, AuthStatus, AuthUser } from "@/types/auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provides authentication state (Checklist: "Create authentication state")
 * and the signed-in contributor's public profile (Checklist: "Create user
 * profile state") to the whole app.
 *
 * On mount it asks the backend who's signed in (GET /auth/me) rather than
 * trusting anything stored client-side, since the httpOnly session cookie
 * is the actual source of truth and isn't readable from JS anyway.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refresh = useCallback(async () => {
    setStatus("loading");
    const current = await fetchCurrentUser();
    setUser(current);
    setStatus(current ? "authenticated" : "unauthenticated");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loginWithGitHub = useCallback(async (returnTo?: string) => {
    await startGitHubLogin(returnTo);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus("unauthenticated");
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, loginWithGitHub, refresh, logout }),
    [user, status, loginWithGitHub, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access authentication state and profile from any client component. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
