import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { GuideStatusBadge } from "@/components/GuideStatusBadge";
import { PersonalizePanel } from "@/components/PersonalizePanel";
import { categoryLabel } from "@/lib/guides";
import { planSchema } from "@/lib/plan-schema";
import { createClient } from "@/lib/supabase/server";

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // guides_select only returns this row if it's published, or the
  // caller is its author, or the caller is an admin — a draft that
  // isn't the caller's own is simply absent from the result, not an
  // access-denied error. That collapses "doesn't exist" and "exists but
  // you can't see it" into the same 404, which is exactly the behavior
  // the design doc asks for.
  const { data: guide } = await supabase
    .from("guides")
    .select("id, title, category, status, body_md, author_id, profiles(display_name)")
    .eq("id", id)
    .single();

  if (!guide) notFound();

  let canEdit = guide.author_id === user.id;
  if (!canEdit) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    canEdit = profile?.role === "admin";
  }

  const authorName =
    (guide.profiles as unknown as { display_name: string } | null)
      ?.display_name ?? "Unknown";

  // P1 pre-fill: saved training preferences from the profile.
  const { data: profile } = await supabase
    .from("profiles")
    .select("equipment, days_per_week, level")
    .eq("id", user.id)
    .single();

  // Latest saved plan for this (user, guide) — an ordinary client select
  // under plans_select (user_id = auth.uid()), no endpoint needed. The
  // `(user_id, guide_id, created_at desc)` index on plans exists for
  // exactly this query.
  const { data: latestPlanRow } = await supabase
    .from("plans")
    .select("id, plan")
    .eq("user_id", user.id)
    .eq("guide_id", guide.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parsedPlan = latestPlanRow
    ? planSchema.safeParse(latestPlanRow.plan)
    : null;
  const initialPlan =
    parsedPlan && parsedPlan.success
      ? { id: latestPlanRow!.id, plan: parsedPlan.data }
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
      >
        ← Back to browse
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {categoryLabel(guide.category)}
          </span>
          <GuideStatusBadge status={guide.status} />
        </div>
        {canEdit && (
          <Link
            href={`/guides/${guide.id}/edit`}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Edit
          </Link>
        )}
      </div>

      <h1 className="mt-3 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        {guide.title}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        By {authorName}
      </p>

      {/* Persistent disclaimer, requirements §7: content here and in any
          generated plan is general fitness information, not medical or
          clinical advice — shown regardless of what the model itself says. */}
      <p className="mt-4 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
        General fitness information only — not medical or clinical advice.
      </p>

      <div className="prose dark:prose-invert mt-6 max-w-none">
        <ReactMarkdown>{guide.body_md}</ReactMarkdown>
      </div>

      <div className="mt-10 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <PersonalizePanel
          guideId={guide.id}
          initialPlan={initialPlan}
          defaultEquipment={profile?.equipment ?? []}
          defaultDaysPerWeek={profile?.days_per_week ?? 3}
          defaultLevel={profile?.level ?? "beginner"}
        />
      </div>
    </div>
  );
}
