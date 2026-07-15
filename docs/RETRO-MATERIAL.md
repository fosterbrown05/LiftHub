# LiftHub — Retrospective Material

A factual timeline assembled from `git log` and `docs/NOTES.md`, for the
author (Foster) to write the actual retrospective from. No analysis or
opinions below — just what happened, in order, with commit hashes and dates
so any entry can be checked against the source.

## Timeline

**2026-07-08 — Scaffold and auth**
- `fbdef07` Initial commit.
- `1eb238e` Scaffolded Next.js (App Router, TypeScript, Tailwind).
- `614f355` Added Supabase SSR client/server helpers and the
  session-refresh proxy.
- `9bd2040` Added auth: signup, login, logout.

**2026-07-09 — Schema, the 0004 grant find, seed, middleware, guide CRUD**
- `1b2b2d0` Added migrations 0001–0003 (schema, triggers, RLS), transcribed
  from design doc §2.1/§2.2/§4 and applied to the linked cloud project via
  `supabase db push`. Diffed line-by-line against the source doc; only
  difference was stray trailing whitespace from the Word doc's paragraph
  breaks (NOTES.md, 2026-07-08 entry).
- `0d9bcc1` Found and fixed: `0003_rls.sql`'s `revoke update (role) on
  public.profiles from authenticated` was a no-op. Root cause: Supabase
  grants every new table a table-level privilege to `authenticated`
  automatically at creation; a column-level `REVOKE` only removes a
  column-level ACL entry, and none existed, so the table-level grant still
  permitted the update. Discovered when a signed-in member successfully
  self-promoted to admin via a direct `profiles` update during RLS
  re-verification. Fixed in `0004_fix_role_column_grant.sql` (a new
  migration, not a rewrite of 0003, to preserve the audit trail) by
  revoking the table-level UPDATE grant entirely and re-granting only the
  non-role columns. Verified via `pg_class.relacl`/`pg_attribute.attacl`
  inspection and a live re-test: direct role update → `permission denied
  for table profiles`; direct `display_name` update → succeeded (NOTES.md,
  2026-07-09).
- `67f2890` Added the seed script (one user per role, sample guides). Uses
  the service-role client to set the first trainer/admin roles directly,
  since `set_user_role()` requires an existing admin to call it and no
  admin exists yet at bootstrap — a documented one-time exception, not a
  reusable pattern (NOTES.md, 2026-07-09).
- `99dd3ec` Added the role gate to `proxy.ts` per design doc §3.3: session
  check for all routes except `/login`/`/signup`/`/api/*`, role check
  (via a `profiles` query per gated request, not a JWT claim) for
  `/admin/*` (admin) and `/dashboard`+editor routes (trainer/admin).
- `bb22256` Logged the proxy behavioral proof (all three roles + signed-out,
  against `/`, `/dashboard`, `/admin/users`).
- `8ef95a3` Added guide CRUD: `/dashboard`, `/guides/new`,
  `/guides/[id]/edit`, `app/guides/actions.ts`. Dashboard query narrows to
  "your guides" for trainers even though `guides_select` RLS would allow
  reading any published guide; the edit page adds an explicit
  ownership/admin check beyond RLS as a UX improvement (RLS was already
  the enforced boundary).
- `063690e` Logged the guide CRUD proof (member blocked at both middleware
  and RLS; trainer created/edited/published/deleted a guide through the
  real forms; admin edited and unpublished the trainer's guide without
  reassigning `author_id`, then restored the original seed data).

**2026-07-13 — Browse + guide detail**
- `91be637` Added the real browse page (`/`) and `/guides/[id]`. Browse
  explicitly filters `status = 'published'` for every role (narrower than
  what RLS alone permits). The detail page's 404 for invisible drafts
  comes directly from `guides_select` RLS returning no row, with no
  separate ownership check needed (unlike the editor). Logout placed in
  the browse page's own header — no persistent header existed yet across
  other routes; noted as a gap for the step 7 polish pass.
- `78fa8bf` Logged the browse/detail proof (per-role browse contents,
  category filter, draft visibility by role).

**2026-07-14 — POST /api/personalize and the model-tier correction**
- `1704713` Added `POST /api/personalize`, `lib/ai.ts`, `lib/plan-schema.ts`,
  `lib/supabase/service.ts`, and the guide detail personalize UI. Added a
  400 for malformed request bodies (not specified in the design doc's
  7-step flow). Evaluated and declined Anthropic structured outputs for
  this route, keeping zod (`lib/plan-schema.ts`) as the real validation
  boundary per the design doc.
- `2c4b1db` Logged the route decisions and the model-tier correction: the
  first draft of `lib/ai.ts` defaulted to `claude-opus-4-8`; caught before
  any live call and switched to `claude-haiku-4-5` per design doc §6's
  "small, fast model tier" requirement, which also required removing
  `thinking`/`output_config.effort` (Opus/Sonnet-5/4.6+-only features that
  400 on Haiku 4.5). Also logged: a real Haiku response wrapped its JSON in
  a ` ```json ` code fence despite the prompt instructing otherwise,
  handled with a `stripCodeFence()` helper in `lib/ai.ts` (a formatting
  workaround, kept separate from zod's shape validation). Proved real plan
  generation, reload-without-a-second-API-call, the 10/day rate limit (by
  driving the count to exactly 10 and checking the DB directly), and the
  502 path (temporarily forcing an invalid `generatePlan()` return value,
  confirmed no `plans` row written, then reverted).

**2026-07-15 — Q&A, admin panel, shared header, personalize polish,
responsive pass, README**
- `688a3bf` Added Q&A on the guide detail page (`app/guides/qa-actions.ts`,
  `components/QASection.tsx`, `components/RoleBadge.tsx`). No new
  migration — `qa_posts`, `qa_stamp`, `qa_flat`, and the RLS policies were
  already in migrations 0001–0003.
- `2a5cc27` Added the admin panel (`/admin/users`). Role changes call the
  `set_user_role` RPC (self-checked, security definer). Account deletion
  calls `service.auth.admin.deleteUser()` because `auth.users` isn't
  reachable through RLS at all; this action re-checks the caller's role in
  application code before calling it, the one place in the app that does
  so instead of relying on a database policy.
- `3bf8670` Logged the Q&A/admin proof: trainer answer's `author_role`
  snapshot came back `trainer`; a reply-to-a-reply was rejected by
  `qa_flat` (`"answers cannot have replies"`); deleting a question removed
  its answer via cascade; both member and trainer calling `set_user_role`
  directly were refused (`"admins only"`); and the promote/demote
  centerpiece — one member session (single login, one cookie, reused
  throughout), blocked from `/dashboard` → admin promotes to trainer via
  the RPC → same cookie, no re-login → `/dashboard` returns 200 → admin
  demotes → same cookie → blocked again. Proofs used direct `supabase-js`
  calls under each seeded account's real session (the same DB calls the
  server actions make) plus, for the centerpiece, `@supabase/ssr`'s own
  cookie-jar logic against the real `next dev` server and real middleware
  — no mocking.
- `fd631ee` **The header fix.** Added the shared role-aware header: moved
  `/`, `/dashboard`, `/guides/*`, `/admin/*` into an `(app)` route group
  with a `layout.tsx` that renders `components/Header.tsx` (wordmark
  linking to `/`, a `Dashboard` link for trainer/admin, an `Admin` link for
  admin, display name + logout for everyone signed in). Replaces the
  ad-hoc wordmark+logout block that had existed only on the browse page
  since 2026-07-13. Header reads role per request, same freshness
  reasoning as `proxy.ts`.
- `e5b08a4` Personalize polish: disabled the whole form (not just the
  submit button) while a request is in flight, added a spinner and
  skeleton plan cards, and collapsed three different internal 502 messages
  (rate-limit check failure, model/validation failure, plan insert
  failure) into one consistent retry message for the client.
- `865300a` Responsive pass at 375px. Verified with a real headless-browser
  pass (Playwright, installed locally for verification only, not added to
  `package.json`) across all three seeded roles plus signed-out
  `/login`/`/signup`. Found one real break: the dashboard guides table and
  the admin users table both used `min-w-[600px]` inside
  `overflow-x-auto`, so columns past the first (Status/Updated/Edit on
  dashboard; Delete account on admin) clipped off-screen with no visible
  scroll affordance. Fixed by rendering a stacked card list under the `md`
  breakpoint and keeping the table at `md:` and up; re-verified both
  breakpoints render correctly. No other screen needed a change — header,
  guide cards, plan cards, the editor's markdown/preview grid, and Q&A
  with nested answers/badges already degraded cleanly at 375px from
  existing `flex-col`/`grid-cols-1`-first conventions.
- `8cb552e` Added `README.md`: overview, role/permission tables, a mermaid
  architecture diagram (request flow through `proxy.ts`, RLS, and the
  personalize route), stack rationale, and setup instructions — content
  sourced from `CLAUDE.md`, the design doc, and `docs/NOTES.md`.

## Recurring pattern across every feature: the verification method

Every entry above that includes a "proved behaviorally" step used the same
method: sign in as the actual seeded account(s) (`member@lifthub.dev`,
`trainer@lifthub.dev`, `admin@lifthub.dev`) and exercise the real code path
— either through the real UI/forms, or via direct `supabase-js`/RPC calls
under that account's real session when a Server Action or RLS policy was
the thing being proved — against the real hosted Supabase project and a
real `next dev` server. No mocked Supabase client and no mocked Anthropic
API appear anywhere in the proof log. Two proofs used a lower-level
technique for the same reason: the 2026-07-15 promote/demote centerpiece
and the 2026-07-15 responsive pass both needed a real, persistent browser
session (cookies) rather than a fresh login per request — the former via
`@supabase/ssr`'s own cookie-jar logic scripted directly against `next dev`,
the latter via a real headless browser (Playwright) at a 375px viewport.
