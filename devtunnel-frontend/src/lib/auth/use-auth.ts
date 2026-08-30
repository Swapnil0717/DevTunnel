"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "./auth-provider";

/**
 * Reads the current authentication + user profile state.
 * Must be used within `<AuthProvider>` (mounted once in the root layout).
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }

  return context;
}
