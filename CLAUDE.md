# LiftHub — Claude Code context

## What this is
LiftHub is a fitness hub where admin-verified trainers publish guides (workout
programs, nutrition, gym picks, recovery) and members personalize programs to
their equipment/schedule via an LLM, plus ask questions that trainers answer.
It is an AiLab intern pre-assignment. Full specs live in `docs/` — read the
design doc before implementing anything non-trivial.

Grading emphases that shape how we work:
- The author (Foster) must be able to explain every line. When writing anything
  security-relevant, explain the diff briefly as you go.
- Auth/authz code gets extra scrutiny: show middleware, RLS, and the
  personalize route as reviewable diffs — never bury them in a big commit.
- Commit per feature with meaningful messages. No giant commits.

## Stack
Next.js (App Router, TypeScript) · Supabase (Auth, Postgres, RLS) ·
Tailwind CSS · Anthropic API (personalize feature) · Vercel · react-markdown.

## Roles & enforcement
Three roles on `profiles.role`: member (default at sign-up), trainer
(admin-verified), admin. Three enforcement layers:
1. UI — hide what you can't use (cosmetic)
2. middleware.ts — block routes: /dashboard + editor routes (trainer/admin),
   /admin (admin). Role is read via a `profiles` query per gated request
   (NOT a JWT claim — role changes must apply on next request).
3. RLS — the only real security boundary. Policies live in
   `supabase/migrations/0003_*.sql`.

## Data model (see docs/design doc §2 for full SQL)
- profiles: 1:1 with auth.users, created by trigger. `role` column is REVOKED
  from authenticated; changes go only through `set_user_role()` RPC (admin-checked).
- guides: author-owned. draft/published enum. Trainers edit ONLY their own;
  admins edit/unpublish any.
- qa_posts: questions (parent_id null) and answers (parent_id set). Flat thread
  enforced by `qa_flat` trigger. `author_id`/`author_role` stamped by trigger —
  never set from the client.
- plans: append-only. Latest row per (user, guide) is shown; today's count per
  user is the rate limit (10/day); inserted ONLY by the server (service role).
  No client insert policy on purpose.

## Key decisions already made (do not re-litigate silently)
- `my_role()` is a security definer function — avoids RLS recursion on profiles.
- CRUD goes through supabase-js under RLS. The ONLY custom endpoint is
  POST /api/personalize (401/404/429/502 semantics per design doc §5.1).
- Model output is validated with zod (`lib/plan-schema.ts`) before storage.
- Personalize prompt must include the safety constraints from requirements §7:
  general fitness guidance only, no medical/injury/clinical claims, point
  users with pain or conditions to professionals.
- Guide bodies are markdown rendered with react-markdown.

## Working rules
- ANTHROPIC_API_KEY and SUPABASE_SERVICE_ROLE_KEY are server-only. Never import
  them into client components. `.env.local` is gitignored.
- Schema changes are migration files, never dashboard clicks.
- After each feature: run it, test as all three roles where relevant, commit.
- Prefer boring, readable code over clever code — it has to be explained live.

## Build order
1. Scaffold + Supabase auth (signup/login/logout) + skeleton Vercel deploy
2. Migrations 0001–0003 + seed script (one user per role, sample guides) + middleware
3. Guides CRUD: dashboard + editor (markdown preview)
4. Browse (category filter) + guide detail page
5. /api/personalize + plan schema + plan cards + rate limit
6. Q&A + admin user panel (set_user_role RPC) — full three-role walkthrough
7. Polish: loading/error states, responsive pass, README, retrospective notes
