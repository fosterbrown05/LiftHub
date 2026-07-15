"use client";

import { askQuestion, postAnswer, deleteQaPost } from "@/app/(app)/guides/qa-actions";
import { RoleBadge } from "@/components/RoleBadge";

type Role = "member" | "trainer" | "admin";

export type QaPost = {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_role: Role;
  body: string;
  created_at: string;
  authorName: string;
};

function DeleteButton({ action }: { action: () => void }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this post? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-xs font-medium text-red-700 hover:underline dark:text-red-400"
      >
        Delete
      </button>
    </form>
  );
}

function Post({
  post,
  guideId,
  viewerId,
  isAdmin,
}: {
  post: QaPost;
  guideId: string;
  viewerId: string;
  isAdmin: boolean;
}) {
  const canDelete = post.author_id === viewerId || isAdmin;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {post.authorName}
        </span>
        <RoleBadge role={post.author_role} />
        <span className="text-xs text-zinc-400">
          {new Date(post.created_at).toLocaleDateString()}
        </span>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{post.body}</p>
      {canDelete && (
        <DeleteButton action={deleteQaPost.bind(null, guideId, post.id)} />
      )}
    </div>
  );
}

export function QASection({
  guideId,
  questions,
  viewerId,
  viewerRole,
  canPost,
}: {
  guideId: string;
  questions: { question: QaPost; answers: QaPost[] }[];
  viewerId: string;
  viewerRole: Role;
  canPost: boolean;
}) {
  const isAdmin = viewerRole === "admin";
  const canAnswer = viewerRole === "trainer" || viewerRole === "admin";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Questions & Answers
      </h2>

      {canPost ? (
        <form
          action={askQuestion.bind(null, guideId)}
          className="flex flex-col gap-2"
        >
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Ask a question about this guide…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="self-start rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Ask
          </button>
        </form>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Q&amp;A opens once this guide is published.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {questions.map(({ question, answers }) => (
          <div
            key={question.id}
            className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <Post
              post={question}
              guideId={guideId}
              viewerId={viewerId}
              isAdmin={isAdmin}
            />

            <div className="mt-4 flex flex-col gap-4 border-l-2 border-zinc-100 pl-4 dark:border-zinc-900">
              {answers.map((answer) => (
                <Post
                  key={answer.id}
                  post={answer}
                  guideId={guideId}
                  viewerId={viewerId}
                  isAdmin={isAdmin}
                />
              ))}
            </div>

            {canAnswer && (
              <form
                action={postAnswer.bind(null, guideId, question.id)}
                className="mt-4 flex flex-col gap-2 pl-4"
              >
                <textarea
                  name="body"
                  required
                  rows={2}
                  placeholder="Write an answer…"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="submit"
                  className="self-start rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
                >
                  Answer
                </button>
              </form>
            )}
          </div>
        ))}

        {questions.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No questions yet.
          </p>
        )}
      </div>
    </div>
  );
}
