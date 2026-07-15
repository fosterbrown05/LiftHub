"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function updateUserRole(targetId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // set_user_role (migration 0003) is security definer and checks
  // my_role() = 'admin' itself before writing — this call carries no
  // privilege of its own, it just invokes that DB-enforced check under
  // the caller's own session. A non-admin reaching this action (e.g. if
  // middleware were ever bypassed) gets refused by the RPC, not by this
  // route.
  const { error } = await supabase.rpc("set_user_role", {
    target: targetId,
    new_role: formData.get("role") as string,
  });

  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/users");
}

export async function deleteUserAccount(targetId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Deleting an account means removing the auth.users row, which only
  // the Supabase admin API (service role) can do — RLS and
  // set_user_role only ever govern the `profiles` table, never
  // auth.users itself. The service client bypasses RLS entirely, so
  // unlike every other write in this app, this is one place that has to
  // re-check the caller's role in application code before touching
  // anything, instead of leaning on a policy to refuse it.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    redirect(`/admin/users?error=${encodeURIComponent("admins only")}`);
  }

  const service = createServiceClient();
  // profiles.id references auth.users(id) on delete cascade (migration
  // 0001), and guides/qa_posts/plans all reference profiles(id) on
  // delete cascade — so this one call also removes the user's guides,
  // Q&A posts, and plans.
  const { error } = await service.auth.admin.deleteUser(targetId);

  if (error) {
    redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/admin/users");
}
