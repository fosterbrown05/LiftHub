// Renders the badge for a qa_posts.author_role snapshot (never the
// author's *current* role — see qa_stamp trigger, migration 0002).
// Members get no badge; a plain name is enough for them.
export function RoleBadge({ role }: { role: "member" | "trainer" | "admin" }) {
  if (role === "member") return null;

  const isAdmin = role === "admin";
  return (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium " +
        (isAdmin
          ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
          : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200")
      }
    >
      {isAdmin ? "Admin" : "Trainer"}
    </span>
  );
}
