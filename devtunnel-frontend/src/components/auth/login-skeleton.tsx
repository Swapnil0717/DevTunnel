// src/components/auth/login-skeleton.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintFill,
  BlueprintGhostParagraph,
  BlueprintGhostText,
} from "@/components/ui/blueprint-kit";

/**
 * Blueprint placeholder for `/login`, rebuilt line for line from the real
 * page (`app/login/page.tsx`) and its components so nothing moves when the
 * page swaps in:
 *
 *  - the `<main>` wrapper is the real one's classes verbatim
 *    (`flex min-h-screen flex-col items-center justify-center gap-9 px-6
 *    py-16`); the real `sr-only` `<h1>` is out of flow, so it has no
 *    counterpart here;
 *  - `Logo`: `h-6 w-auto` of a 1643x262 image = 24px x 150.5px;
 *  - `LoginCard` / `PortalChoiceCard`: `max-w-[340px]`, 1px border,
 *    `px-[26px] py-7`. Every text line is ghosted from the real copy
 *    (`BlueprintGhostText` / `BlueprintGhostParagraph`) so it takes the
 *    same line box and wraps onto the same number of lines; the buttons
 *    are the real 38px;
 *  - the "No account?" note (`mt-[22px] text-xs`) and `AuthStatusPanel`
 *    (`rounded-lg`, `px-[14px] py-3`, 6px dot + 11px mono label over a
 *    12px line, idle state) follow the card exactly as on the page.
 *
 * `variant="portal"` is the card an already-signed-in admin sees on
 * `/login` ("Welcome back" + Continue as Admin / User); it has no
 * "No account?" note and no status panel, as on the page. The admin's
 * name isn't known while the session is still being checked, so the
 * greeting is ghosted at a typical length.
 */
export function LoginSkeleton({ variant = "signin" }: { variant?: "signin" | "portal" }) {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 00 — Sign in"
      revLabel="Rev — checking your session"
      contentClassName="flex min-h-screen w-full flex-col items-center justify-center gap-9 px-6 py-16"
    >
      <BlueprintFill className="h-6 w-[150.5px]" />

      {variant === "portal" ? <PortalCardSkeleton /> : <SignInSkeleton />}
    </BlueprintSheet>
  );
}

const CARD_CLASS =
  "w-full max-w-[340px] rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] px-[26px] py-7";

function SignInSkeleton() {
  return (
    <>
      <div className="flex w-full flex-col items-center">
        <div className={CARD_CLASS} aria-hidden="true">
          <div className="mb-1 text-center text-[15px] font-medium">
            <BlueprintGhostText text="Sign in to DevTunnel" />
          </div>

          <BlueprintGhostParagraph
            className="mb-[22px] text-center text-[13px] leading-[1.5]"
            text="Connect your GitHub account to create and manage tunnels."
          />

          <BlueprintFill className="h-[38px] w-full rounded-md" />

          <div className="my-[18px] flex items-center gap-2">
            <div className="h-px flex-1 bg-blueprint/25" />
            <span className="font-mono text-[11px]">
              <BlueprintGhostText text="secured via oauth" />
            </span>
            <div className="h-px flex-1 bg-blueprint/25" />
          </div>

          <div className="text-center text-[11.5px] leading-[1.6]">
            <BlueprintGhostText text="By continuing you agree to the" />
            <br />
            <BlueprintGhostText text="Terms of Service and Privacy Policy" />
          </div>
        </div>

        <BlueprintGhostParagraph
          className="mt-[22px] text-xs"
          text="No account? GitHub sign-in creates one automatically."
        />
      </div>

      <div className="w-full max-w-[340px]" aria-hidden="true">
        <div className="rounded-lg border border-blueprint/25 bg-blueprint/[0.05] px-[14px] py-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <BlueprintFill className="h-[6px] w-[6px] shrink-0 rounded-full" />
            <span className="font-mono text-[11px]">
              <BlueprintGhostText text="idle" />
            </span>
          </div>
          <div className="text-xs">
            <BlueprintGhostText text="Waiting for GitHub" />
          </div>
        </div>
      </div>
    </>
  );
}

function PortalCardSkeleton() {
  return (
    <div className={CARD_CLASS} aria-hidden="true">
      <div className="mb-1 text-center text-[15px] font-medium">
        <BlueprintGhostText text="Welcome back, Contributor" />
      </div>

      <BlueprintGhostParagraph
        className="mb-[22px] text-center text-[13px] leading-[1.5]"
        text="This account has admin access. How do you want to sign in?"
      />

      <div className="flex flex-col gap-2">
        <BlueprintFill className="h-[38px] w-full rounded-md" />
        <BlueprintFill className="h-[38px] w-full rounded-md" />
      </div>

      <BlueprintGhostParagraph
        className="mt-[18px] text-center text-[11.5px] leading-[1.6]"
        text="You can switch back to the admin portal any time from your account menu."
      />
    </div>
  );
}
