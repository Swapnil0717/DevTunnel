"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchCurrentUser,
  logout as logoutRequest,
} from "./api";

import type {
  AuthStatus,
  AuthUser,
} from "./types";

import {
  clearClientViewMode,
} from "./view-mode";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  refreshUser: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

export const AuthContext =
  createContext<AuthContextValue | undefined>(
    undefined,
  );

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: AuthUser | null;
  /**
   * The server already asked the backend who this is and the answer was
   * "nobody" (a signed-out visitor on a public route). Starts in the
   * `"unauthenticated"` state and skips the redundant client-side
   * `/auth/me` round trip, so signed-out pages render their guest UI
   * (sign-in links instead of star/join buttons) on the very first paint
   * rather than flashing a "loading" state first.
   */
  anonymous?: boolean;
}

export function AuthProvider({
  children,
  initialUser = null,
  anonymous = false,
}: AuthProviderProps) {
  const [user, setUser] =
    useState<AuthUser | null>(initialUser);

  const [status, setStatus] =
    useState<AuthStatus>(
      initialUser
        ? "authenticated"
        : anonymous
          ? "unauthenticated"
          : "loading",
    );

  const refreshUser = useCallback(async () => {
    try {
      const current =
        await fetchCurrentUser();

      setUser(current);

      setStatus(
        current
          ? "authenticated"
          : "unauthenticated",
      );

      return current;
    } catch {
      setUser(null);
      setStatus("unauthenticated");

      return null;
    }
  }, []);

  useEffect(() => {
    if (initialUser || anonymous) return;

    void refreshUser();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();

    /*
     * Clear Admin/User portal selection.
     *
     * Therefore after logout and another login,
     * an admin will see the portal chooser again.
     */
    clearClientViewMode();

    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      refreshUser,
      logout,
    }),
    [
      user,
      status,
      refreshUser,
      logout,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}