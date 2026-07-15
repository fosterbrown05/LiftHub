import { GuideForm } from "@/components/GuideForm";
import { createGuide } from "../actions";

export default async function NewGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        New guide
      </h1>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6">
        <GuideForm action={createGuide} />
      </div>
    </div>
  );
}
