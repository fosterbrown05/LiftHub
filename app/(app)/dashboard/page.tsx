import Link from "next/link";
import { redirect } from "next/navigation";
import { GuideStatusBadge } from "@/components/GuideStatusBadge";
import { categoryLabel } from "@/lib/guides";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";

  // Trainers see only their own guides (including drafts); admins see
  // every guide. RLS's guides_select would allow a trainer to also read
  // other authors' *published* guides, so this query narrows on purpose
  // to keep the dashboard scoped to "your guides" per the design doc.
  let query = supabase
    .from("guides")
    .select("id, title, category, status, updated_at, author_id, profiles(display_name)")
    .order("updated_at", { ascending: false });

  if (!isAdmin) {
    query = query.eq("author_id", user.id);
  }

  const { data: guides } = await query;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {isAdmin ? "All guides" : "Your guides"}
        </h1>
        <Link
          href="/guides/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          New guide
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Title</th>
              <th className="py-2 pr-4 font-medium">Category</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              {isAdmin && <th className="py-2 pr-4 font-medium">Author</th>}
              <th className="py-2 pr-4 font-medium">Updated</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {guides?.map((guide) => (
              <tr
                key={guide.id}
                className="border-b border-zinc-100 dark:border-zinc-900"
              >
                <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">
                  {guide.title}
                </td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                  {categoryLabel(guide.category)}
                </td>
                <td className="py-2 pr-4">
                  <GuideStatusBadge status={guide.status} />
                </td>
                {isAdmin && (
                  <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                    {(guide.profiles as unknown as { display_name: string } | null)
                      ?.display_name ?? "—"}
                  </td>
                )}
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                  {new Date(guide.updated_at).toLocaleDateString()}
                </td>
                <td className="py-2 text-right">
                  <Link
                    href={`/guides/${guide.id}/edit`}
                    className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {guides?.length === 0 && (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            {isAdmin ? "No guides yet." : "You haven't created any guides yet."}
          </p>
        )}
      </div>
    </div>
  );
}
