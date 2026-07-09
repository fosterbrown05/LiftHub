export function GuideStatusBadge({ status }: { status: "draft" | "published" }) {
  const isDraft = status === "draft";
  return (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
        (isDraft
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200")
      }
    >
      {isDraft ? "Draft" : "Published"}
    </span>
  );
}
