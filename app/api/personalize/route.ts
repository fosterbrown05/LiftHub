import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePlan } from "@/lib/ai";
import { planSchema } from "@/lib/plan-schema";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const DAILY_PLAN_LIMIT = 10;

const requestSchema = z.object({
  guideId: z.uuid(),
  equipment: z.array(z.string()).default([]),
  daysPerWeek: z.number().int().min(1).max(7),
  level: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  // 1. Session check — 401 if absent. This is the one custom endpoint in
  // the app, so unlike CRUD (which goes through supabase-js and lets RLS
  // reject unauthenticated calls) we check explicitly before doing anything.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  const { guideId, equipment, daysPerWeek, level } = body.data;

  // 2. Rate limit — count today's plans rows for this user under their own
  // RLS (plans_select: user_id = auth.uid()), not the service client. A
  // UTC day boundary keeps this simple and deterministic rather than
  // reasoning about the caller's timezone.
  const startOfDayUTC = new Date();
  startOfDayUTC.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await supabase
    .from("plans")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", startOfDayUTC.toISOString());
  if (countError) {
    return NextResponse.json({ error: "rate limit check failed" }, { status: 502 });
  }
  if ((count ?? 0) >= DAILY_PLAN_LIMIT) {
    return NextResponse.json(
      { error: "daily personalization limit reached" },
      { status: 429 },
    );
  }

  // 3. Fetch the guide using the caller's own token. guides_select omits
  // drafts that aren't the caller's own rather than erroring, so a member
  // requesting another trainer's draft gets .single() returning no row —
  // the same 404-for-invisible-rows behavior as the guide detail page.
  const { data: guide } = await supabase
    .from("guides")
    .select("title, category, body_md")
    .eq("id", guideId)
    .single();
  if (!guide) {
    return NextResponse.json({ error: "guide not found" }, { status: 404 });
  }

  // 4-5. Prompt the model, then validate its output against the zod schema
  // before it's trusted with anything — storage, or the client response.
  // Any failure here (network error, malformed JSON, schema mismatch) is
  // the same "try again" signal to the client: 502 with a retry hint.
  let plan;
  try {
    const raw = await generatePlan(guide, { equipment, daysPerWeek, level });
    const parsed = planSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error("model output failed schema validation");
    }
    plan = parsed.data;
  } catch (err) {
    // Logged server-side only — the client gets the generic retry message
    // above, never the raw error (which could include prompt/response
    // content we don't want leaking into a browser console or a client
    // error-tracking tool).
    console.error("personalize: model call or validation failed", err);
    return NextResponse.json(
      { error: "personalization failed, please retry" },
      { status: 502 },
    );
  }

  // 6. Insert with the service client — plans has no client insert policy
  // on purpose (migration 0003); only server code past the rate-limit
  // check is allowed to write a row.
  const service = createServiceClient();
  const { data: inserted, error: insertError } = await service
    .from("plans")
    .insert({
      user_id: user.id,
      guide_id: guideId,
      inputs: { equipment, days_per_week: daysPerWeek, level },
      plan,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return NextResponse.json({ error: "failed to save plan" }, { status: 502 });
  }

  // 7. Return plan and planId.
  return NextResponse.json({ planId: inserted.id, plan }, { status: 200 });
}
