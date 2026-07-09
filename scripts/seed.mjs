// Seeds one user per role (member/trainer/admin) plus a few sample
// guides owned by the trainer. Safe to re-run — looks up existing users
// by email and existing guides by title before creating.
//
// Must run with the service role key, not the anon key. There is no
// admin yet to legitimately promote anyone: set_user_role() itself
// checks my_role() = 'admin', and a plain client update to
// profiles.role is blocked (migration 0004). The service role bypasses
// RLS and column grants entirely, which is the only way to create the
// very first admin — every other role change afterward goes through
// set_user_role() like normal. See docs/NOTES.md for the full writeup.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((line) => line.split("=")),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const DEV_PASSWORD = "lifthub-dev-pw";

const SEED_USERS = [
  { email: "member@lifthub.dev", displayName: "Dev Member", role: "member" },
  { email: "trainer@lifthub.dev", displayName: "Dev Trainer", role: "trainer" },
  { email: "admin@lifthub.dev", displayName: "Dev Admin", role: "admin" },
];

const SEED_GUIDES = [
  {
    title: "Push/Pull/Legs for Beginners",
    category: "programs",
    status: "published",
    body_md: `# Push/Pull/Legs for Beginners

A 3-day split covering push, pull, and leg days. Rest 48 hours between
repeats of the same day.

## Day 1 — Push
- Bench press: 4x8
- Overhead press: 3x10
- Triceps pushdown: 3x12

## Day 2 — Pull
- Deadlift: 3x5
- Barbell row: 4x8
- Biceps curl: 3x12

## Day 3 — Legs
- Squat: 4x8
- Romanian deadlift: 3x10
- Calf raise: 3x15

*General fitness information, not medical advice.*`,
  },
  {
    title: "Protein Basics for Muscle Gain",
    category: "nutrition",
    status: "published",
    body_md: `# Protein Basics for Muscle Gain

Aim for roughly 0.7–1g of protein per pound of bodyweight, spread
across 3–4 meals.

- Lean meats, eggs, dairy, legumes, and protein powder all count.
- Consistency across the week matters more than precise timing.

*General fitness information, not medical advice. If you have a kidney
condition or other health concern, check with a professional first.*`,
  },
  {
    title: "What to Look For in a Home Gym",
    category: "gym_picks",
    status: "published",
    body_md: `# What to Look For in a Home Gym

- An adjustable bench covers more exercises than a flat-only bench.
- A power rack with safety pins is worth the floor space if you squat
  or bench heavy.
- Resistance bands are a cheap, portable stand-in for cable machines.`,
  },
  {
    title: "Sleep and Recovery Fundamentals",
    category: "recovery",
    status: "published",
    body_md: `# Sleep and Recovery Fundamentals

- 7–9 hours of sleep is when most muscle repair happens.
- A rest day is not a wasted day — it's part of the program.
- Persistent joint pain (not muscle soreness) is a sign to see a
  professional, not to push through it.`,
  },
  {
    title: "Draft: Advanced Powerlifting Cycle (WIP)",
    category: "programs",
    status: "draft",
    body_md: `# Advanced Powerlifting Cycle (WIP)

Still drafting the peaking week. Not ready for members yet.`,
  },
];

async function findUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function ensureUser({ email, displayName, role }) {
  let user = await findUserByEmail(email);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw error;
    user = data.user;
    console.log(`created ${email}`);
  } else {
    console.log(`${email} already exists, reusing`);
  }

  // handle_new_user (migration 0002) already created the profiles row
  // with role='member'. Promoting to trainer/admin here uses the
  // service role specifically because no admin exists yet to call
  // set_user_role() legitimately — see the file header comment.
  if (role !== "member") {
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", user.id);
    if (error) throw error;
  }

  return user;
}

async function ensureGuide(guide, authorId) {
  const { data: existing } = await supabase
    .from("guides")
    .select("id")
    .eq("title", guide.title)
    .maybeSingle();

  if (existing) {
    console.log(`guide "${guide.title}" already exists, skipping`);
    return;
  }

  const { error } = await supabase.from("guides").insert({
    ...guide,
    author_id: authorId,
  });
  if (error) throw error;
  console.log(`created guide "${guide.title}"`);
}

async function main() {
  const users = {};
  for (const seedUser of SEED_USERS) {
    users[seedUser.role] = await ensureUser(seedUser);
  }

  for (const guide of SEED_GUIDES) {
    await ensureGuide(guide, users.trainer.id);
  }

  console.log("\nSeed complete. Shared dev password:", DEV_PASSWORD);
  console.log(SEED_USERS.map((u) => `  ${u.role.padEnd(8)} ${u.email}`).join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
