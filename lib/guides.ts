export const GUIDE_CATEGORIES = [
  { value: "programs", label: "Programs" },
  { value: "nutrition", label: "Nutrition" },
  { value: "gym_picks", label: "Gym Picks" },
  { value: "recovery", label: "Recovery" },
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]["value"];
