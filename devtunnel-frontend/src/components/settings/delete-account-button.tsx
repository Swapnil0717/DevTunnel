"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/use-auth";
import { deleteAccount } from "@/lib/settings/api";
import { TrashIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";

/**
 * "Danger zone" — account deletion. Requires a native `confirm()` before
 * calling the API, same pattern as `DeleteProjectButton`
 * (components/admin/projects/delete-project-button.tsx), the one other
 * irreversible-from-the-UI action in this app.
 *
 * `DELETE /settings/account` (devtunnel-backend/src/routes/settings.ts)
 * soft-deletes the row and clears the session cookies server-side in the
 * same request, so once it resolves there is no valid session left to
 * revoke — `logout()` from `useAuth` is still called afterward purely to
 * reset this tab's in-memory auth state before navigating away (same as
 * `LogoutButton`), not because the backend needs another request.
 */
export function DeleteAccountButton() {
  const { logout } = useAuth();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Delete your DevTunnel account? Your profile and contribution history will be removed. This can't be undone.",
    );
    if (!confirmed) return;

    setError(null);
    setIsDeleting(true);

    try {
      await deleteAccount();
      try {
        await logout();
      } catch {
        // Best-effort local cleanup only — the account is already
        // deleted and the session cookies already cleared server-side,
        // so a failure here doesn't block navigating away.
      }
      router.push("/login");
    } catch {
      setError("Couldn't delete your account. Try again.");
      setIsDeleting(false);
    }
  }

  return (
    <section className="rounded-[10px] border border-status-error-border bg-surface p-5">
      <h2 className="m-0 mb-1 text-sm font-medium text-text">Danger zone</h2>
      <p className="m-0 mb-3 text-[12.5px] text-text-muted">
        Deleting your account removes your profile and contribution history. This can&apos;t be
        undone.
      </p>

      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-1.5 rounded-[8px] border border-status-error-border bg-status-error-bg px-4 py-2 text-[13px] font-medium text-status-error-label transition-colors hover:bg-status-error-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-error disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? <Spinner size={13} /> : <TrashIcon className="h-3.5 w-3.5 shrink-0" />}
        {isDeleting ? "Deleting…" : "Delete account"}
      </button>
      {error ? <p className="m-0 mt-2 text-[12px] text-status-error-label">{error}</p> : null}
    </section>
  );
}
