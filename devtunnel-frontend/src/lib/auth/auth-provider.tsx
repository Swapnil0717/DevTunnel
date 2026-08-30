"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchCurrentUser, logout as logoutRequest } from "./api";
import type { AuthStatus, AuthUser } from "./types";

export interface AuthContextValue {
  /** The signed-in user's profile, or `null` when signed out. */
  user: AuthUser | null;
  status: AuthStatus;
  /** Re-fetches `GET /auth/me` and updates local state. */
  refreshUser: () => Promise<void>;
  /** Calls `POST /auth/logout` and clears local state. */
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  /**
   * Optional user resolved server-side (e.g. by a protected layout that
   * already verified the session). Avoids a loading flash for routes that
   * know the answer up front.
   */
  initialUser?: AuthUser | null;
}

/**
 * Application-wide authentication state (devtunnel_workflow.txt task:
 * "Create authentication state" / "Create user profile state").
 *
 * This context is a convenience layer for the UI (nav avatars, greetings,
 * conditional buttons, etc.). It is *not* the security boundary — actual
 * route protection happens server-side in `(protected)/layout.tsx` and,
 * ultimately, in the backend's own authorization checks (see
 * lib/auth/session.ts for why).
 */
export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [status, setStatus] = useState<AuthStatus>(
    initialUser ? "authenticated" : "loading",
  );

  const refreshUser = useCallback(async () => {
    try {
      const current = await fetchCurrentUser();
      setUser(current);
      setStatus(current ? "authenticated" : "unauthenticated");
    } catch {
      // A failed /auth/me call (network error, backend down, ...) is treated
      // as "signed out" for UI purposes rather than surfacing a crash.
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    // Server-verified users skip the extra client round trip on first paint.
    if (initialUser) return;
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, status, refreshUser, logout }),
    [user, status, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
