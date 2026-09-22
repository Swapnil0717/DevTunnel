"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

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

/**
 * How often an already-authenticated protected page re-checks its session
 * with the backend in the background. `(protected)/layout.tsx` and
 * `admin/(protected)/layout.tsx` only verify the session once, server-side,
 * when that layout is first rendered — Next.js App Router does not re-run
 * a shared layout's data fetching on every client-side navigation between
 * sibling pages under it, so someone who stays on the app via soft
 * navigation (no full page reload) could otherwise keep "using" a session
 * the backend already considers expired or revoked until they happen to
 * hit a 401 on some unrelated action. 5 minutes keeps that window small
 * without adding meaningful load.
 */
const SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

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
  /**
   * Set by a *protected* layout (`(protected)/layout.tsx`,
   * `admin/(protected)/layout.tsx`) whose server-side check already
   * guaranteed a signed-in user for the current request. Turns on
   * background re-validation (see `SESSION_REVALIDATE_INTERVAL_MS`): if a
   * later check finds the session is no longer valid, this redirects to
   * `loginPath` instead of just flipping local React state to
   * "unauthenticated" and leaving the person stranded on a page that
   * quietly stopped working. Never set on public pages — a signed-out
   * visitor there is the expected, normal case, not a session that
   * "expired" (see `session.ts` and rule 16: public pages never force a
   * redirect).
   */
  enforceSession?: boolean;
  /** Where `enforceSession` redirects once the session is confirmed gone. */
  loginPath?: string;
}

export function AuthProvider({
  children,
  initialUser = null,
  anonymous = false,
  enforceSession = false,
  loginPath = "/login",
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

  const router = useRouter();
  const pathname = usePathname();
  // Mirrors `status` without triggering re-renders/effect re-runs, so the
  // interval/focus/visibility listeners below can always read the latest
  // value without being recreated every time it changes.
  const statusRef = useRef(status);
  statusRef.current = status;

  const refreshUser = useCallback(async () => {
    try {
      const current =
        await fetchCurrentUser();

      const wasAuthenticated = statusRef.current === "authenticated";

      setUser(current);

      setStatus(
        current
          ? "authenticated"
          : "unauthenticated",
      );

      if (!current && wasAuthenticated && enforceSession) {
        // The session that got this layout past its server-side check is
        // gone now (expired, revoked, or the account was signed out
        // elsewhere) — send the person to sign in again rather than
        // leaving them on a page whose data will just keep failing.
        router.replace(`${loginPath}?next=${encodeURIComponent(pathname || "/")}`);
      }

      return current;
    } catch {
      setUser(null);
      setStatus("unauthenticated");

      return null;
    }
  }, [enforceSession, loginPath, pathname, router]);

  useEffect(() => {
    if (initialUser || anonymous) return;

    void refreshUser();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enforceSession) return;

    const revalidate = () => {
      if (document.visibilityState === "visible") void refreshUser();
    };

    const interval = window.setInterval(revalidate, SESSION_REVALIDATE_INTERVAL_MS);
    // Also catch it as soon as the person comes back to the tab, rather
    // than waiting up to `SESSION_REVALIDATE_INTERVAL_MS` for the next
    // scheduled tick — this is the common case (someone leaves the tab
    // open overnight, session expires, they return in the morning).
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enforceSession]);

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