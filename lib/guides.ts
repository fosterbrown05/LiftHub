export const GUIDE_CATEGORIES = [
  { value: "programs", label: "Programs" },
  { value: "nutrition", label: "Nutrition" },
  { value: "gym_picks", label: "Gym Picks" },
  { value: "recovery", label: "Recovery" },
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]["value"];

export function categoryLabel(value: string) {
  return GUIDE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
