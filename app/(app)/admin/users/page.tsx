import { redirect } from "next/navigation";
import { AdminUsersTable } from "@/components/AdminUsersTable";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // proxy.ts already gates /admin to admin-only (design doc §3.2), but
  // every other page in this app re-checks its own access instead of
  // trusting middleware alone, so this one does too.
  const { data: viewerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (viewerProfile?.role !== "admin") redirect("/");

  // profiles_select (migration 0003) lets any signed-in user read every
  // profile — it exists so guides/qa_posts can show author names, and
  // the admin panel reuses that same read rather than a special policy.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Users
      </h1>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <AdminUsersTable profiles={profiles ?? []} viewerId={user.id} />
      </div>
    </div>
  );
}
