"use client";

import { updateUserRole, deleteUserAccount } from "@/app/(app)/admin/users/actions";

const ROLES = ["member", "trainer", "admin"] as const;

type Profile = {
  id: string;
  display_name: string;
  role: (typeof ROLES)[number];
  created_at: string;
};

function RoleForm({ profile }: { profile: Profile }) {
  return (
    <form
      action={updateUserRole.bind(null, profile.id)}
      className="flex items-center gap-2"
    >
      <select
        name="role"
        defaultValue={profile.role}
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Save
      </button>
    </form>
  );
}

function DeleteForm({ profile }: { profile: Profile }) {
  return (
    <form
      action={deleteUserAccount.bind(null, profile.id)}
      onSubmit={(e) => {
        if (
          !confirm(
            `Delete ${profile.display_name || "this user"}'s account? This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
      >
        Delete account
      </button>
    </form>
  );
}

export function AdminUsersTable({
  profiles,
  viewerId,
}: {
  profiles: Profile[];
  viewerId: string;
}) {
  return (
    <>
      {/* A table wide enough for Name/Role/Delete clips off-screen with no
          scroll affordance under md — a card list stands in until there's
          room for the table (md:hidden / hidden md:block below). */}
      <div className="flex flex-col gap-3 md:hidden">
        {profiles.map((profile) => {
          const isSelf = profile.id === viewerId;
          return (
            <div
              key={profile.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {profile.display_name || "(no name)"}
                  {isSelf && (
                    <span className="ml-2 text-xs text-zinc-400">(you)</span>
                  )}
                </span>
                {isSelf && (
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {profile.role}
                  </span>
                )}
              </div>
              {!isSelf && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <RoleForm profile={profile} />
                  <DeleteForm profile={profile} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const isSelf = profile.id === viewerId;
              return (
                <tr
                  key={profile.id}
                  className="border-b border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-50">
                    {profile.display_name || "(no name)"}
                    {isSelf && (
                      <span className="ml-2 text-xs text-zinc-400">(you)</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {isSelf ? (
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {profile.role}
                      </span>
                    ) : (
                      <RoleForm profile={profile} />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!isSelf && <DeleteForm profile={profile} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
