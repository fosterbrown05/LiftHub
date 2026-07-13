import Link from "next/link";
import { categoryLabel } from "@/lib/guides";

export function GuideCard({
  id,
  title,
  category,
  authorName,
  updatedAt,
}: {
  id: string;
  title: string;
  category: string;
  authorName: string;
  updatedAt: string;
}) {
  return (
    <Link
      href={`/guides/${id}`}
      className="block rounded-lg border border-zinc-200 p-4 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        {categoryLabel(category)}
      </span>
      <h2 className="mt-2 font-medium text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        By {authorName} · Updated {new Date(updatedAt).toLocaleDateString()}
      </p>
    </Link>
  );
}
