import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Public routes need neither a session nor a role. /api/personalize enforces
// its own auth (401) and rate limit (429) in the route handler itself, per
// design doc §5.1 — it deliberately isn't gated here.
const PUBLIC_ROUTES = ["/login", "/signup"];

// Mirrors design doc §3.2 / CLAUDE.md: /dashboard + editor routes need
// trainer or admin, /admin needs admin. Everything else just needs a
// session (checked separately below) — drafts-only-for-owner/admin on
// /guides/[id] is a guides_select RLS concern, not a middleware one.
function roleRequiredFor(pathname: string): "admin" | "trainer" | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (
    pathname.startsWith("/dashboard") ||
    pathname === "/guides/new" ||
    /^\/guides\/[^/]+\/edit$/.test(pathname)
  ) {
    return "trainer";
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabase, response, user } = await updateSession(request);

  if (PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/api/")) {
    return response;
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const requiredRole = roleRequiredFor(pathname);
  if (requiredRole) {
    // A profiles query per gated request, not a JWT claim — so a promotion
    // (member -> trainer) takes effect on the user's very next request
    // instead of waiting for their token to refresh. Design doc §3.3.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowed =
      requiredRole === "admin"
        ? profile?.role === "admin"
        : profile?.role === "trainer" || profile?.role === "admin";

    if (!allowed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
