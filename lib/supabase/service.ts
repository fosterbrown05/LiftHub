import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS entirely. Only ever call this from
// server-only code that has already done its own authorization check —
// there is no anon-key safety net behind it. Used by the personalize route
// to write `plans` rows, since migration 0003 deliberately has no client
// insert policy on that table (see docs/NOTES.md, 2026-07-08 entry).
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
