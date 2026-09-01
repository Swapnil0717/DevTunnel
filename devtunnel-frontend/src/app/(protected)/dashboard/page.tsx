import { redirect } from "next/navigation";

// Contributor home now lives at /home. Keep this route resolving
// instead of 404ing for anyone with the old URL bookmarked.
export default function DashboardPage() {
  redirect("/home");
}