"use client";

import { useState } from "react";
import type { Plan } from "@/lib/plan-schema";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;

// Status-code-specific copy — the route's error responses map directly to
// what the member should do next (429: wait; 502: the retry hint the route
// already returns; everything else: a generic message).
function messageFor(status: number, apiError: string | undefined) {
  if (status === 429) {
    return "You've reached today's personalization limit (10/day). Try again tomorrow.";
  }
  if (status === 404) {
    return "This guide is no longer available.";
  }
  return apiError ?? "Something went wrong. Please try again.";
}

export function PersonalizePanel({
  guideId,
  initialPlan,
  defaultEquipment,
  defaultDaysPerWeek,
  defaultLevel,
}: {
  guideId: string;
  initialPlan: { id: string; plan: Plan } | null;
  defaultEquipment: string[];
  defaultDaysPerWeek: number;
  defaultLevel: string;
}) {
  const [equipmentInput, setEquipmentInput] = useState(
    defaultEquipment.join(", "),
  );
  const [daysPerWeek, setDaysPerWeek] = useState(defaultDaysPerWeek);
  const [level, setLevel] = useState(
    LEVELS.includes(defaultLevel as (typeof LEVELS)[number])
      ? defaultLevel
      : "beginner",
  );
  const [plan, setPlan] = useState<Plan | null>(initialPlan?.plan ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const equipment = equipmentInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      const response = await fetch("/api/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guideId, equipment, daysPerWeek, level }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(messageFor(response.status, data.error));
        return;
      }

      setPlan(data.plan);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        Personalize this program
      </h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap"
      >
        <label className="flex flex-col gap-1 text-sm">
          Equipment (comma-separated)
          <input
            type="text"
            value={equipmentInput}
            onChange={(e) => setEquipmentInput(e.target.value)}
            placeholder="dumbbells, bench"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Days per week
          <input
            type="number"
            min={1}
            max={7}
            value={daysPerWeek}
            onChange={(e) => setDaysPerWeek(Number(e.target.value))}
            className="w-24 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Level
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l[0].toUpperCase() + l.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Personalizing…" : plan ? "Regenerate" : "Personalize"}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {plan && (
        <div className="flex flex-col gap-4">
          {plan.days.map((day) => (
            <div
              key={day.day}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                Day {day.day} — {day.focus}
              </h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                {day.exercises.map((exercise, i) => (
                  <li key={i}>
                    {exercise.name} — {exercise.sets} × {exercise.reps}
                    {exercise.note && (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {" "}
                        ({exercise.note})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <ul className="list-disc pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            {plan.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
