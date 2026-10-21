import { redirect } from "next/navigation";

interface SignupPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

/** Sign-up and sign-in are one page now; keep old `/signup` links working. */
export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.next) qs.set("next", params.next);
  if (params.error) qs.set("error", params.error);
  const query = qs.toString();
  redirect(query ? `/login?${query}` : "/login");
}
