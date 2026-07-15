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

## 2026-07-13 — Browse + guide detail

`/` is now the real browse page (`app/page.tsx`) instead of the
placeholder — resolves the dead-code branch noted on 2026-07-09.
`/guides/[id]` (`app/guides/[id]/page.tsx`) is new.

- **Browse always filters `status = 'published'` explicitly**, for
  every role, not just members. RLS would let a trainer's own drafts
  through too, but browse is the public-facing list — drafts belong on
  `/dashboard`, so the query narrows on purpose rather than relying on
  RLS to be the only thing keeping drafts out of a shared list.
- **The detail page's 404 comes for free from RLS, unlike the editor's
  ownership check.** `guides_select` simply omits a row the caller
  isn't allowed to see (draft, not theirs, not admin) rather than
  erroring — so "doesn't exist" and "exists but you can't see it"
  collapse into the same empty result, and `notFound()` on a missing
  row is the whole mechanism. This is different from the edit page
  (2026-07-09 entry), which needed an explicit ownership check because
  a *published* guide is readable by anyone — the detail page has no
  such gap, since visibility and read-access are the same question
  there.
- **Logout moved from the old placeholder into the browse page's
  header** (a form next to the "LiftHub" heading) rather than a
  site-wide nav — there still isn't a persistent header across
  `/dashboard`/`/guides/*`, so logout is presently only reachable from
  `/`. Left as a known gap for the step 7 polish pass rather than
  building a full nav bar now.
- Extracted `categoryLabel()` into `lib/guides.ts` (was duplicated
  locally in the dashboard) since browse and detail both need it too —
  three call sites was the point where the shared helper earned its
  keep.

**Proved behaviorally**: signed in as each seeded role, hitting `/`
(with and without a `?category=` filter) and a specific draft's
`/guides/[id]` URL directly:

- **Member**: browse shows exactly the 4 published seed guides, never
  the draft (checked by grepping the response for the draft's title —
  zero matches). `?category=nutrition` narrows to exactly the one
  nutrition guide. Opening the draft's guide id directly →  real 404
  ("This page could not be found"), not an error page. Opening a
  published guide authored by the trainer renders normally with no
  Edit button.
- **Trainer**: opening their own draft's URL directly → 200, renders
  the title, a "Draft" status pill, and an Edit button.
- **Admin**: opening the same draft URL → 200 (admins can open any
  draft, not just their own).

## 2026-07-14 — POST /api/personalize: two flagged decisions

Building the route from design doc §5.1 (`app/api/personalize/route.ts`,
`lib/ai.ts`, `lib/plan-schema.ts`, `lib/supabase/service.ts`). Two choices
worth recording that weren't spelled out in the design doc's 7-step flow:

- **Added a 400 for malformed request bodies.** The design doc's flow
  starts at "resolve the session — 401 if absent" and doesn't mention
  request-body shape at all. Without a check, a missing `guideId` or a
  non-numeric `daysPerWeek` would fail later — either as an ugly
  `.eq(undefined)` Postgres error surfaced as a 502, or as `NaN` silently
  reaching the model prompt. Added `requestSchema` (zod, local to the
  route file, distinct from `lib/plan-schema.ts` which validates the
  *model's* output) and a 400 before the session-derived steps that
  depend on a well-formed body. Flagging this since it's a step the
  design doc doesn't call out — everything else in the route maps
  1:1 to §5.1's numbered flow.
- **Considered Anthropic's structured-outputs feature
  (`output_config.format` with a JSON schema) and decided against it for
  now.** Structured outputs would make the model's JSON shape
  contractually valid, which reduces how often the 502 path fires — but
  the design doc is explicit that `lib/plan-schema.ts` (zod) is the
  validation boundary, and using structured outputs would make that
  boundary mostly decorative (its failure mode becomes close to
  unreachable in normal operation, which is also why it's not the way to
  demonstrate the 502 path — see the behavioral proof below, which
  forces a malformed response directly instead). Plain-prompt +
  zod-validate is what's shipped; structured outputs is a reasonable
  production hardening step for later, not a step back from what's here
  — zod stays as the real boundary either way, since even a
  schema-constrained model response is still an external system's output
  and the code shouldn't trust it by construction.

## 2026-07-14 — Personalize: model choice, prompt design, validation, proof

**Model tier.** Design doc §6 calls for "a small, fast model tier" for
personalize. First draft defaulted to `claude-opus-4-8` out of habit while
building the route; caught and corrected before any live call — switched
to `claude-haiku-4-5` (fastest, cheapest tier), which also meant dropping
`thinking: {type: "adaptive"}` and `output_config.effort` from the
request, since those are Opus/Sonnet-5/4.6+ features and 400 on Haiku 4.5.

**Prompt design (`lib/ai.ts`).** The system prompt has two non-negotiable
sections: safety constraints transcribed from requirements §7 (general
fitness guidance only; no medical/injury/clinical claims; a note pointing
to a professional whenever pain, injury, or a health condition comes up),
and an explicit output-format spec matching `lib/plan-schema.ts` field for
field (two top-level keys, exact shape of each `days[]`/`exercises[]`
entry) so the model isn't guessing the shape from the design doc's example
JSON alone. The user prompt is just the guide's title/category/body_md
plus the member's equipment/days/level — no conversation history, no
prior plans, single-shot per call.

**Validation reasoning.** `generatePlan()` returns raw text and does *no*
parsing — that split is deliberate, so a malformed response is a zod
validation failure the route turns into 502, not an exception buried
inside `lib/ai.ts`. One real gap surfaced immediately on the first live
call: Haiku 4.5 wrapped its JSON in a ` ```json ` fence despite the prompt
saying not to (log: `SyntaxError: Unexpected token '`', "```json\n{"... is
not valid JSON`). Added `stripCodeFence()` in `lib/ai.ts` — strips one
fence if present, otherwise leaves the text untouched — because this is a
formatting artifact of *how* the model chose to wrap a correct answer, not
a shape problem `lib/plan-schema.ts` should be responsible for catching.
Genuine shape problems (missing field, wrong type, empty array) still fall
through to zod and still 502. Also added a `console.error` in the route's
catch block, server-side only — the client keeps the generic retry
message; the raw error (which could include prompt/response content) never
crosses into a response body.

**Proved behaviorally**, signed in as `member@lifthub.dev` and
`trainer@lifthub.dev` against the real Anthropic API (no mocking) and the
real Postgres `plans` table:

- **Real plan generation.** POSTed `{guideId: <Push/Pull/Legs>, equipment:
  ["dumbbells","bench"], daysPerWeek: 3, level: "beginner"}` → `200` with a
  real 3-day plan (dumbbell substitutions correctly reasoned from the
  barbell-based original, e.g. "Dumbbell single-arm rows — swapped from
  deadlift and barbell row"), a `notes` array including the
  general-guidance disclaimer, and a real `planId`. Confirmed via a
  service-role query that the row exists in `plans` with that exact id.
- **Reload on revisit.** A fresh `GET /guides/[id]` (new request, no
  client JS involved) embedded that same `planId` and plan content in the
  server-rendered payload — the guide detail page's own `plans` query
  (latest row for `user_id`+`guide_id`) found it without the client ever
  calling the API again.
- **Rate limit.** Drove the member account to exactly 10 `plans` rows for
  the day (confirmed by direct count, not by trusting response codes
  alone — one intermediate 429 got misattributed to the wrong request
  while scripting the loop, so the DB count is what's cited here, not the
  loop's console output). The next call after that returned `429
  {"error":"daily personalization limit reached"}` with no new row
  inserted.
- **Malformed JSON.** Temporarily replaced `generatePlan()`'s return value
  with a literal invalid string, restarted the dev server, and called the
  real route (as the trainer account, to avoid the member's now-exhausted
  daily limit) — `502 {"error":"personalization failed, please retry"}`,
  with the server log showing the exact `JSON.parse` failure and no
  `plans` row written. Reverted `lib/ai.ts` immediately after (confirmed
  via `git status` — the file is untracked, so there's no diff to leave
  behind), then re-ran a real call on the restored code to confirm nothing
  was left broken.

## 2026-07-15 — Q&A + admin panel (build order step 6)

Two features, two commits: Q&A on the guide detail page
(`app/guides/qa-actions.ts`, `components/QASection.tsx`,
`components/RoleBadge.tsx`), then the admin panel
(`app/admin/users/`, `components/AdminUsersTable.tsx`). No new
migration — qa_posts, `qa_stamp`, `qa_flat`, and every RLS policy this
step needed were already in migrations 0001–0003; this step was UI and
server actions only.

- **Q&A UI is a thin layer over RLS/triggers, on purpose.** All three
  server actions (`askQuestion`, `postAnswer`, `deleteQaPost`) do
  nothing but call `supabase.from("qa_posts")` under the caller's own
  session — no ownership or role checks in application code, because
  `qa_insert`/`qa_delete`/`qa_flat` already are that check. The one
  place the UI narrows ahead of the database: the answer form only
  renders under a question (never under another answer) and only for
  trainer/admin viewers, and the ask/answer forms disappear entirely on
  a draft guide — matching `qa_insert`'s "published guides only" so a
  member never even sees a control the database would reject.
- **Account deletion is the one action in this app where an
  authorization check lives in application code, not the database**
  (`app/admin/users/actions.ts`, `deleteUserAccount`). Role changes stay
  fully DB-enforced — `updateUserRole` just calls the `set_user_role`
  RPC, which is `security definer` and already raises `admins only`
  itself, so the action re-checks nothing. But deleting an *account*
  means removing the `auth.users` row, which isn't reachable through
  RLS at all — only `service.auth.admin.deleteUser()` can do it, and
  that call bypasses every policy in the database by construction.
  Since nothing downstream would refuse an unauthorized call, this
  action checks `profiles.role === 'admin'` itself before ever
  constructing the service client. Flagging this per CLAUDE.md's "extra
  scrutiny" rule for auth code — it's a deliberate, narrow exception to
  "RLS is the only real boundary," not an oversight.
- **The admin panel hides self-role-change and self-delete controls in
  the UI** (own row renders as plain text, no Save/Delete buttons).
  Purely a UX guard against locking yourself out mid-demo — RLS and
  `set_user_role` don't grant any special protection for acting on your
  own row, so this is cosmetic, not a security boundary.
- **Proof methodology note**: several proofs below exercise the same
  Postgres session a Server Action would use — signed in via
  `supabase-js` as the seeded account, calling the same
  `.from("qa_posts")`/`.rpc(...)` the action calls — rather than driving
  a browser, since there's no browser tool available in this session.
  This is the same code path (`qa-actions.ts`/`admin/users/actions.ts`
  do nothing but that same call), so it proves the actual boundary
  (RLS/triggers/RPC) rather than a simulation of it. The one proof that
  needed real HTTP + real middleware (the promotion/demotion
  centerpiece) used `@supabase/ssr`'s own cookie-jar logic against the
  real `next dev` server, so that one is a real browser-equivalent
  session, not a shortcut.

**Proved behaviorally**, against the real hosted Supabase project (no
local/Docker instance — `supabase/config.toml` is for local dev but
this project links straight to the hosted DB) and a real `next dev`
server:

- **Trainer answer shows its badge.** Signed in as `member@lifthub.dev`
  via `supabase-js`, inserted a question on the seeded "Push/Pull/Legs"
  guide. Signed in as `trainer@lifthub.dev`, inserted an answer
  (`parent_id` = the question). The returned row's `author_role` came
  back `'trainer'` — stamped by the `qa_stamp` trigger from the
  trainer's actual `profiles.role` at insert time, never sent by the
  client.
- **Reply-to-reply rejected by `qa_flat`.** Attempted a third insert
  with `parent_id` = the trainer's answer (a reply to a reply) →
  rejected with `"answers cannot have replies"`, the exact exception
  text from migration 0002's `check_flat_thread()`.
- **Deleting a question removes its answers.** Confirmed one answer row
  existed under the question (`parent_id` count = 1), then deleted the
  question as its author (the member). A service-role check afterward
  found both the question and its answer gone — the `on delete cascade`
  on `qa_posts.parent_id`, no application-level fan-out.
- **Non-admin calling `set_user_role` is refused.** Both
  `member@lifthub.dev` and `trainer@lifthub.dev` called
  `supabase.rpc('set_user_role', { target: <trainer's id>, new_role:
  'admin' })` directly → both refused with `"admins only"`, the
  exception `set_user_role` raises when `my_role() <> 'admin'`
  (migration 0003).
- **The centerpiece: promote takes effect without re-login, demote
  locks it back.** One `supabase-js` session for `member@lifthub.dev`
  (single password sign-in, one cookie jar, reused for every request
  below — no second login anywhere in this sequence):
  1. `GET /dashboard` with that member's cookie → `307` to `/`
     (blocked, still `role = 'member'`).
  2. Separately, `admin@lifthub.dev` called
     `set_user_role(target: <member id>, new_role: 'trainer')`.
  3. `GET /dashboard` again — **same cookie, no new sign-in** — → `200`,
     page renders. This is the freshness property design doc §3.3 calls
     out: middleware reads role via a `profiles` query per gated
     request, not a JWT claim, so a promotion applies on the very next
     request instead of waiting for token refresh.
  4. Admin called `set_user_role(target: <member id>, new_role:
     'member')` to demote.
  5. `GET /dashboard` again — same cookie, still no re-login — → `307`
     to `/` again: access is revoked exactly as immediately as it was
     granted.
  Confirmed the seed roles were back to their defaults
  (member/trainer/admin) and `qa_posts` back to empty after cleanup —
  no test data left behind.
