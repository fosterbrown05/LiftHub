"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function askQuestion(guideId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // author_id and author_role are stamped server-side by the qa_stamp
  // trigger (migration 0002) — never set them here, so a client can't
  // claim a badge it doesn't have.
  const { error } = await supabase.from("qa_posts").insert({
    guide_id: guideId,
    body: formData.get("body") as string,
  });

  if (error) {
    redirect(`/guides/${guideId}?qaError=${encodeURIComponent(error.message)}`);
  }
  redirect(`/guides/${guideId}`);
}

export async function postAnswer(
  guideId: string,
  parentId: string,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // qa_flat (migration 0002) rejects this insert if parentId is itself
  // an answer, or belongs to a different guide — the backstop for the
  // "answer only a root question" rule this UI already enforces by only
  // rendering an answer form under questions.
  const { error } = await supabase.from("qa_posts").insert({
    guide_id: guideId,
    parent_id: parentId,
    body: formData.get("body") as string,
  });

  if (error) {
    redirect(`/guides/${guideId}?qaError=${encodeURIComponent(error.message)}`);
  }
  redirect(`/guides/${guideId}`);
}

export async function deleteQaPost(guideId: string, postId: string) {
  const supabase = await createClient();

  // qa_delete RLS (author or admin) is the real boundary; the UI only
  // renders this action's button for those same callers. Deleting a
  // question cascades to its answers via qa_posts.parent_id's
  // `on delete cascade` (migration 0001) — no application-level fan-out
  // needed.
  const { error } = await supabase.from("qa_posts").delete().eq("id", postId);

  if (error) {
    redirect(`/guides/${guideId}?qaError=${encodeURIComponent(error.message)}`);
  }
  redirect(`/guides/${guideId}`);
}
