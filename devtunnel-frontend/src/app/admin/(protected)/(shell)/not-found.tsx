import Link from "next/link";

/**
 * `not-found.tsx` for the `admin/(protected)` segment. Without this file,
 * the `notFound()` calls in `projects/[id]`, `opensource-tools/[id]`, and
 * `tasks/[id]` (each hit when an admin opens a stale/mistyped id) bubble
 * all the way to the single ROOT `not-found.tsx` — which unmounts the
 * entire admin shell (`AdminSidebar`/`AdminHeader`) and links back to `/`,
 * the public marketing homepage. That drops a signed-in admin onto
 * logged-out marketing content with no way back to the admin portal
 * except retyping the URL.
 *
 * This file fixes that the same way the per-route `loading.tsx` files
 * fixed the blank-panel problem: it renders inside `(shell)/layout.tsx`'s
 * `{children}`, one level below the admin shell, so the sidebar/header stay
 * mounted and the admin gets a real way back in.
 */
export default function AdminNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div>
        <h2 className="m-0 mb-1 text-[15px] font-medium text-text">Not found</h2>
        <p className="m-0 text-[13px] text-text-muted">
          This project, task, or tool doesn&apos;t exist or may have been removed.
        </p>
      </div>
      <Link
        href="/admin"
        className="inline-flex items-center justify-center rounded-md bg-text px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
      >
        Back to Admin Dashboard
      </Link>
    </div>
  );
}