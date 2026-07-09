import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth cookie on every request and returns the caller's user
// (if any) alongside the request-bound client, so proxy.ts can do route
// gating (§3.3 of the design doc) without a second round-trip to Supabase.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Must call getUser() (not getSession()) so an expired token is verified
  // against Supabase and refreshed, not just read from the cookie as-is.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, response, user };
}
