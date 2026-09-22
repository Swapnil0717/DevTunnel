import { AdminHeader } from "@/components/auth/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { TrainFooter } from "@/components/layout/train-footer";

/**
 * Admin Home shell: `AdminSidebar` (branding + Module 31's full section
 * list, `md` and up) is `position: fixed`, so it stays put however far the
 * page scrolls and the footer can never move it; the content column beside
 * it reserves its width with `md:ml-[224px]` (keep in step with
 * `AdminSidebar`'s `w-[224px]`). The column is topped by `AdminHeader`
 * (current section + signed-in admin + sign-out) and, below `md` where the
 * sidebar is hidden, `AdminMobileNav` — same nav entries as a horizontally
 * scrollable strip. Every admin page inside this group renders in
 * `{children}` beneath those two, and the train footer closes the column —
 * inside the page area, never under the sidebar.
 *
 * This is a sibling route group to the three `new/` full-bleed wizard
 * segments (`projects/new`, `tasks/new`, `opensource-tools/new`), which
 * each skip this shell via their own `layout.tsx` instead of a runtime
 * pathname check — see the comment on `admin/(protected)/layout.tsx` for
 * why that split exists.
 */
export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <AdminSidebar />
      <div className="flex min-h-screen min-w-0 flex-col md:ml-[224px]">
        <AdminHeader />
        <AdminMobileNav />
        <div className="flex-1">{children}</div>
        <TrainFooter />
      </div>
    </div>
  );
}
