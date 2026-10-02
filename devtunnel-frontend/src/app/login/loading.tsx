import { LoginSkeleton } from "@/components/auth/login-skeleton";

/**
 * `/login` — calls `getServerUser()` to redirect an already-signed-in
 * contributor straight through. Renders the signed-out page's exact
 * layout (`LoginSkeleton`: logo, `LoginCard`, "No account?" note and
 * `AuthStatusPanel`); the admin "Welcome back" card gets its own variant,
 * which `page.tsx` passes to its `BlueprintReveal`.
 */
export default function LoginLoading() {
  return <LoginSkeleton />;
}
