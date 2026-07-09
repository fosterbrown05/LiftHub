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

## 2026-07-09 — Found: `revoke update (role)` is a no-op on Supabase

While re-verifying the RLS smoke tests, a signed-in member successfully
updated their own `profiles.role` to `'admin'` directly via
`supabase.from('profiles').update({ role: 'admin' })` — something
migration 0003 is explicitly supposed to prevent.

**Root cause**: Supabase provisions every new table with a **table-level**
grant to `anon`/`authenticated`/`service_role` (`alter default
privileges ... grant all on tables to ...`, configured once at project
setup, applied automatically whenever a migration creates a new table).
`pg_class.relacl` on `profiles` confirms this:
`authenticated=arwdDxtm/postgres` — full privileges, all columns.

`REVOKE UPDATE (role) ON profiles FROM authenticated` only removes a
**column-level** ACL entry (`pg_attribute.attacl`). Since no
column-level grant existed for `role` (`attacl` is `null` — the only
grant is the table-level one), the revoke has nothing to remove. It
runs without error and silently does nothing. Postgres evaluates column
access as table-level OR column-level, so the untouched table-level
grant still permits the update.

**Downstream effect that made this confusing initially**: a follow-up
test called `set_user_role()` as a non-admin and it didn't raise
`'admins only'` as expected. That wasn't a second bug — the same test
user had already self-promoted to a *real* admin one step earlier via
the direct update, so `my_role()` correctly saw an admin caller. Once
the root cause (the no-op revoke) is fixed, that check should behave
correctly on its own.

**Fix**, added as `0004_fix_role_column_grant.sql` rather than rewriting
`0003_rls.sql` — keeps `0003` verbatim to the reviewed design doc and
preserves the audit trail (what was reviewed, what broke, what fixed
it) across separate commits:

```sql
revoke update on public.profiles from authenticated;
grant update (display_name, equipment, days_per_week, level) on public.profiles to authenticated;
```

**Verified via catalog inspection after applying 0004**:
`pg_class.relacl` on `profiles` now shows `authenticated=ardDxtm` (the
`w`/UPDATE bit gone from the table-level grant). `pg_attribute.attacl`
shows `authenticated=w` on `display_name`, `equipment`, `days_per_week`,
and `level` only — `role` has no grant anywhere, table- or
column-level.

**Verified behaviorally** with a real signed-in member session (anon
key, temporary confirmed test account, cleaned up after):

- `supabase.from('profiles').update({ role: 'admin' }).eq('id', myId)`
  → refused: `permission denied for table profiles`.
- `supabase.from('profiles').update({ display_name: 'Renamed By Self' }).eq('id', myId)`
  → succeeded.
- Re-read via the service-role client confirmed the row's actual state:
  `role` still `'member'`, `display_name` updated to `'Renamed By
  Self'` — the write partially applied (the allowed column) and
  rejected the disallowed one, rather than failing the whole statement
  or silently dropping the role change.

## 2026-07-09 — Seed script and the first-admin chicken-and-egg

`scripts/seed.mjs` creates one user per role (`member@lifthub.dev`,
`trainer@lifthub.dev`, `admin@lifthub.dev`, shared dev password) plus
five sample guides across all four categories, owned by the trainer
(one left as `draft` to exercise the owner/admin-only visibility rule
later).

**Why the script runs with the service role key, not a normal signed-in
client**: promoting a user to trainer or admin has exactly one
legitimate path in this app — `set_user_role()`, which checks
`my_role() = 'admin'` before writing anything. That function is
correct and should stay the only way roles change *after* the app has
its first admin. But it can't be how the *first* admin is created:
there's no admin yet to call it, and a plain client-side update to
`profiles.role` is exactly what migration 0004 blocks. Every legitimate
path is deliberately closed off.

The way out is that `set_user_role()` and RLS both govern the
`authenticated` Postgres role — they say nothing about `service_role`,
which Supabase grants full table access and RLS bypass by design (it's
meant for exactly this: trusted server-side code operating outside the
app's own permission model). The seed script uses that same service
role client the personalize route will use, to reach into `profiles`
directly and set `role = 'trainer'` / `role = 'admin'` once, at
bootstrap. Every role change from then on should go through
`set_user_role()` like normal — the seed script is a one-time
infrastructure-level exception, not a pattern to reuse elsewhere.
