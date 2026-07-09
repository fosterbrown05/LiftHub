"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { GUIDE_CATEGORIES } from "@/lib/guides";

type Guide = {
  id: string;
  title: string;
  category: string;
  body_md: string;
  status: "draft" | "published";
};

export function GuideForm({
  guide,
  action,
  deleteAction,
}: {
  guide?: Guide;
  action: (formData: FormData) => void;
  deleteAction?: (formData: FormData) => void;
}) {
  const [body, setBody] = useState(guide?.body_md ?? "");

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            name="title"
            type="text"
            required
            defaultValue={guide?.title}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            name="category"
            required
            defaultValue={guide?.category ?? GUIDE_CATEGORIES[0].value}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {GUIDE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Body (Markdown)
            <textarea
              name="body_md"
              required
              rows={16}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <div className="flex flex-col gap-1 text-sm">
            Preview
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700">
              <ReactMarkdown>{body}</ReactMarkdown>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            name="status"
            value="draft"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Save draft
          </button>
          <button
            type="submit"
            name="status"
            value="published"
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Publish
          </button>
        </div>
      </form>

      {deleteAction && (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm("Delete this guide? This cannot be undone.")) {
              e.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
          >
            Delete guide
          </button>
        </form>
      )}
    </div>
  );
}
