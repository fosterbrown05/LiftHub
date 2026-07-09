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

## 2026-07-09 — Role gate in proxy.ts (design doc §3.3)

`updateSession` (lib/supabase/middleware.ts) now returns
`{ supabase, response, user }` instead of just the refreshed response,
so `proxy.ts` can read who's signed in without a second round-trip.

`proxy.ts` itself: `/login`/`/signup` stay public, `/api/*` is left
alone (personalize enforces its own auth/rate-limit per §5.1). Every
other route requires a session — including `/`, since §3.2 requires
sign-in for browse too, not just the two obviously-gated routes.
`/admin*` requires admin, `/dashboard*` and the editor routes
(`/guides/new`, `/guides/[id]/edit`) require trainer or admin, checked
via a `profiles` query **per gated request**, not a JWT claim — so a
member promoted to trainer sees `/dashboard` unlock on their very next
request rather than after their token refreshes. Signed-in-but-not-
permitted redirects to `/`, not `/login`.

Side effect noted but not fixed yet: `app/page.tsx`'s "not signed in"
branch (Login/Sign up links) is now unreachable in normal navigation,
since the proxy redirects anonymous `/` before the page renders. Left
alone for now — `/` becomes the real browse page in a later step and
this resolves itself then.

**Proved behaviorally** against the three seeded accounts
(member/trainer/admin@lifthub.dev) plus an unauthenticated request,
requesting `/`, `/dashboard`, `/admin/users` as each:

| Role | `/` | `/dashboard` | `/admin/users` |
|---|---|---|---|
| (none) | 307 → `/login` | 307 → `/login` | 307 → `/login` |
| member | 200 | 307 → `/` | 307 → `/` |
| trainer | 200 | 404 (gate passed, no page yet) | 307 → `/` |
| admin | 200 | 404 (gate passed) | 404 (gate passed) |

A 404 here means the proxy let the request through to Next's router,
which has no page at that path yet (dashboard/admin pages land in a
later build-order step) — the absence of a redirect is the actual
signal that the role check passed, not the 404 itself.

## 2026-07-09 — Guide CRUD: dashboard + editor

Built `/dashboard` (`app/dashboard/page.tsx`), `/guides/new` and
`/guides/[id]/edit` (`components/GuideForm.tsx` shared between them),
and `app/guides/actions.ts` (create/update/delete server actions).

A few decisions worth recording:

- **`guides` has no author-stamping trigger**, unlike `qa_posts`
  (migration 0002 only stamps `qa_posts.author_id`/`author_role`). So
  `createGuide` sets `author_id` itself from the session; `guides_insert`'s
  `with check (author_id = auth.uid() and ...)` is the backstop if that
  code were ever wrong, not the primary mechanism.
- **Dashboard scoping is narrower than what RLS alone would allow.**
  `guides_select` lets a trainer read *any* published guide, not just
  their own — but the dashboard query explicitly filters
  `author_id = user.id` for trainers (admins get every guide, per the
  requirements doc). The dashboard means "your guides," and RLS being
  permissive elsewhere doesn't mean every page should use the loosest
  read it allows.
- **The edit page checks ownership itself, beyond RLS.** A trainer can
  legitimately *read* another trainer's published guide (`guides_select`
  allows it), so without an explicit check they could load someone
  else's edit form and only discover on submit that `guides_update`
  rejects the write. Redirecting non-owner/non-admin visitors away from
  `/guides/[id]/edit` up front is a UX improvement, not a security
  requirement — RLS was already the actual boundary.
- **Added `@tailwindcss/typography`** for the live markdown preview
  pane. The `prose` classes were in the first draft of `GuideForm`
  before the plugin was installed — they'd have been silent no-ops
  (Tailwind v4 doesn't warn on unrecognized utility classes), so this
  was caught by checking rather than assuming the visual output.

**Testing note**: proving the update/delete actions through the real
UI (not just direct Supabase calls) required reverse-engineering
Next.js's form encoding for *bound* server actions. `login`/`signup`
are unbound actions and progressively enhance as a single hidden
`$ACTION_ID_<hash>` field; `updateGuide`/`deleteGuide` are bound via
`.bind(null, id)`, which encodes instead as `$ACTION_REF_<n>` +
`$ACTION_<n>:0` (the real action id + a bound-closure marker) +
`$ACTION_<n>:1` (the bound args, JSON-encoded). Submitting those three
fields alongside the visible form fields reproduces exactly what a
real browser posts with JS disabled.

**Proved behaviorally**, end to end through the real forms and (for
the member case) also directly against Supabase to bypass the UI
entirely:

- **Member**: blocked at the middleware layer (`GET /guides/new` →
  307 to `/`) *and* at RLS when bypassing the UI and calling
  `supabase.from('guides').insert(...)` directly as a signed-in member
  — `new row violates row-level security policy for table "guides"`.
- **Trainer**: created a guide as a draft, edited it, published it,
  and deleted it — all through the real `/guides/new` and
  `/guides/[id]/edit` forms, each step verified against the database
  afterward.
- **Admin**: opened the trainer's seeded "Push/Pull/Legs for
  Beginners" guide at `/guides/[id]/edit` (readable and editable
  despite not being the author), changed its title and unpublished it
  through the real form — `author_id` stayed the trainer's, confirming
  admin edits don't reassign ownership. Restored the guide's original
  title/body/status afterward so seed data stays clean.
