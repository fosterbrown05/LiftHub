import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

// Shared across every signed-in route via app/(app)/layout.tsx. Reads the
// session (and role, for the nav links) on every request rather than
// caching it, so a role change is reflected in the header on the very
// next page load — same freshness reasoning as proxy.ts (design doc §3.3).
export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defensive only: every route under the (app) group requires a session
  // via proxy.ts, so `user` should always be set here.
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "member";
  const canSeeDashboard = role === "trainer" || role === "admin";

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link
          href="/"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          LiftHub
        </Link>

        <nav className="flex flex-wrap items-center gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {canSeeDashboard && (
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
          )}
          {role === "admin" && (
            <Link href="/admin/users" className="hover:underline">
              Admin
            </Link>
          )}
          <span className="text-zinc-400 dark:text-zinc-600">
            {profile?.display_name || "—"}
          </span>
          <form action={logout}>
            <button type="submit" className="hover:underline">
              Log out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
