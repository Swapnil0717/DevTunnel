"use client";

import { useAuth } from "@/context/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="mb-1 text-2xl font-medium text-ink-primary">
        {user ? `Welcome back, ${user.displayName}` : "Welcome back"}
      </h1>
      <p className="mb-8 text-sm text-ink-muted">
        {user
          ? `Signed in as @${user.githubUsername}.`
          : "Loading your profile…"}
      </p>

      <section aria-labelledby="next-steps-heading">
        <h2 id="next-steps-heading" className="mb-3 text-sm font-medium text-ink-secondary">
          Next steps
        </h2>
        <p className="text-sm text-ink-muted">
          Project discovery, tasks, and contributor tools plug in here as those
          modules are built.
        </p>
      </section>
    </main>
  );
}
