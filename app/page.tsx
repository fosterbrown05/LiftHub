import Link from "next/link";
import { GuideCard } from "@/components/GuideCard";
import { GUIDE_CATEGORIES } from "@/lib/guides";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Browse only ever shows published guides, for every role — the proxy
  // already guarantees `user` is set here, but drafts belong on /dashboard,
  // not the public-facing list, even for the trainer who owns them.
  let query = supabase
    .from("guides")
    .select("id, title, category, updated_at, profiles(display_name)")
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data: guides } = await query;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          LiftHub
        </h1>
        {user && (
          <form action={logout}>
            <button
              type="submit"
              className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Log out
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/"
          className={
            "rounded-full px-3 py-1 text-sm font-medium " +
            (!category
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700")
          }
        >
          All
        </Link>
        {GUIDE_CATEGORIES.map((c) => (
          <Link
            key={c.value}
            href={`/?category=${c.value}`}
            className={
              "rounded-full px-3 py-1 text-sm font-medium " +
              (category === c.value
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700")
            }
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {guides?.map((guide) => (
          <GuideCard
            key={guide.id}
            id={guide.id}
            title={guide.title}
            category={guide.category}
            updatedAt={guide.updated_at}
            authorName={
              (guide.profiles as unknown as { display_name: string } | null)
                ?.display_name ?? "Unknown"
            }
          />
        ))}
      </div>

      {guides?.length === 0 && (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No published guides {category ? "in this category " : ""}yet.
        </p>
      )}
    </div>
  );
}
