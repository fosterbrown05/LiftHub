import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "./(auth)/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          LiftHub
        </h1>

        {user ? (
          <>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Signed in as{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-50">
                {(user.user_metadata?.display_name as string) || user.email}
              </span>
            </p>
            <form action={logout} className="mt-6">
              <button
                type="submit"
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Log out
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              Sign in to browse guides and get a personalized plan.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/login"
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                Sign up
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
