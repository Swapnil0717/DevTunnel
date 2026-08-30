import type { Metadata } from "next";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardHeader } from "@/components/layout/dashboard-header";

// Rule 18: authenticated application pages are not public SEO surfaces.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-surface-0">
        <DashboardHeader />
        {children}
      </div>
    </ProtectedRoute>
  );
}
