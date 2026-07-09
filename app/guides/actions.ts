"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function statusFrom(formData: FormData): "draft" | "published" {
  return formData.get("status") === "published" ? "published" : "draft";
}

export async function createGuide(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // guides has no author-stamping trigger (unlike qa_posts), so the
  // server action sets author_id itself. guides_insert's with-check
  // (author_id = auth.uid() and my_role() in ('trainer','admin')) is the
  // backstop if this code were ever wrong.
  const { error } = await supabase.from("guides").insert({
    author_id: user.id,
    title: formData.get("title") as string,
    category: formData.get("category") as string,
    body_md: formData.get("body_md") as string,
    status: statusFrom(formData),
  });

  if (error) {
    redirect(`/guides/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function updateGuide(id: string, formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("guides")
    .update({
      title: formData.get("title") as string,
      category: formData.get("category") as string,
      body_md: formData.get("body_md") as string,
      status: statusFrom(formData),
    })
    .eq("id", id);

  if (error) {
    redirect(`/guides/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function deleteGuide(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("guides").delete().eq("id", id);

  if (error) {
    redirect(`/guides/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}
