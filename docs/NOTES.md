# LiftHub — Working Notes

Running log of design decisions and security-relevant reasoning, kept for
retrospective and demo prep. Newest entries at the bottom of each day.

## 2026-07-08 — Migrations 0001–0003 walkthrough

Applied `supabase/migrations/0001_schema.sql`, `0002_triggers.sql`,
`0003_rls.sql` to the linked cloud project via `supabase db push`,
transcribed verbatim from the design doc (§2.1, §2.2, §4) with zero DDL
drift (diffed line-by-line against the source doc; only difference was
stray trailing spaces on blank lines, an artifact of the Word doc's
paragraph breaks).

- **0001_schema.sql** — three enums (`user_role`, `guide_category`,
  `guide_status`) and four tables. Every foreign key cascades on delete,
  so removing a user/guide/question cleanly removes dependents
  (including `qa_posts.parent_id → qa_posts.id`, which is why deleting a
  question removes its answers). The two `plans` indexes serve two
  different reads: `(user_id, created_at)` counts today's rows for the
  rate limit, `(user_id, guide_id, created_at desc)` finds the latest
  plan per guide.
- **0002_triggers.sql** — `handle_new_user` fires on `auth.users` insert
  and creates the `profiles` row (this is why signup alone is enough —
  no client-side profile insert needed). `stamp_author_role` is
  `security definer` and overwrites `author_id`/`author_role` from the
  session itself, so a client can't post a Q&A answer and claim a role
  it doesn't have. `check_flat_thread` rejects an answer-to-an-answer or
  a cross-guide answer at insert time, not just in policy.
- **0003_rls.sql** — enables RLS on all four tables, then defines
  `my_role()` as `security definer` specifically to dodge infinite
  recursion (a normal function reading `profiles` inside a `profiles`
  policy would re-trigger that same policy). `revoke update (role)`
  is meant to close the gap RLS can't: row policies can't restrict a
  single column, so the role column should be pulled from
  `authenticated` entirely and only changed via `set_user_role()`, which
  checks `my_role() = 'admin'` before writing. `plans` gets a `select`
  policy but deliberately no `insert` policy — rows are only written by
  the service-role client in the personalize route.

Smoke-tested against the live project (real signup/login/logout, real
RLS-blocked anon reads/writes, real trigger-created profile row) with
temporary test accounts, cleaned up afterward via the admin API.
