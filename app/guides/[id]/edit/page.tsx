import { notFound, redirect } from "next/navigation";
import { GuideForm } from "@/components/GuideForm";
import { createClient } from "@/lib/supabase/server";
import { updateGuide, deleteGuide } from "../../actions";

export default async function EditGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: guide } = await supabase
    .from("guides")
    .select("id, title, category, body_md, status, author_id")
    .eq("id", id)
    .single();

  if (!guide) notFound();

  if (guide.author_id !== user.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") redirect("/dashboard");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Edit guide
      </h1>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6">
        <GuideForm
          guide={guide}
          action={updateGuide.bind(null, id)}
          deleteAction={deleteGuide.bind(null, id)}
        />
      </div>
    </div>
  );
}
