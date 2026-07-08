import Link from "next/link";
import { signup } from "../actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; check_email?: string }>;
}) {
  const { error, check_email } = await searchParams;

  if (check_email) {
    return (
      <>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Check your email
        </h1>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          We sent a confirmation link to finish creating your account. Once
          confirmed, you can{" "}
          <Link href="/login" className="font-medium underline">
            log in
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Sign up
      </h1>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form action={signup} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Display name
          <input
            name="display_name"
            type="text"
            required
            autoComplete="name"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign up
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium underline">
          Log in
        </Link>
      </p>
    </>
  );
}
