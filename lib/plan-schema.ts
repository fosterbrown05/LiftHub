import { z } from "zod";

// Mirrors the design doc §5.1 response shape. The model is untrusted input —
// this is what actually stands between whatever text it returns and a row
// in `plans`, so it's deliberately strict (no unknown fields slip through,
// empty arrays aren't a valid "plan").
export const exerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().positive(),
  reps: z.string().min(1),
  note: z.string().min(1).optional(),
});

export const planDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().min(1),
  exercises: z.array(exerciseSchema).min(1),
});

export const planSchema = z.object({
  days: z.array(planDaySchema).min(1),
  notes: z.array(z.string().min(1)).min(1),
});

export type Plan = z.infer<typeof planSchema>;
