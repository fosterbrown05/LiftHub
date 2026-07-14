import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are LiftHub's program personalizer. A member wants a
trainer-authored guide adapted to their own equipment, schedule, and
experience level.

Safety constraints (non-negotiable, per LiftHub requirements §7):
- Stay within general fitness guidance only.
- Never give medical, injury-specific, or clinical dietary advice.
- If the guide or the member's input mentions pain, injury, or a health
  condition, do not attempt to work around it — instead include a note
  recommending they consult a qualified professional before continuing.

Output format (non-negotiable):
- Respond with ONLY a single JSON object. No markdown code fences, no
  preamble, no commentary before or after the JSON.
- The JSON object has exactly two top-level keys:
  - "days": a non-empty array. Each entry has "day" (a positive integer),
    "focus" (a short string, e.g. "Push"), and "exercises" (a non-empty
    array). Each exercise has "name", "sets" (a positive integer), "reps"
    (a string, e.g. "8-10"), and an optional "note" explaining any swap
    from the original guide (e.g. equipment substitution).
  - "notes": a non-empty array of short strings — general remarks about
    how the plan was adapted. Always include at least one general-guidance
    disclaimer here (e.g. "General guidance only - not medical advice").
- Adapt the number of days in the plan to the member's requested days per
  week, and only use the equipment they listed.`;

export interface PersonalizeInputs {
  equipment: string[];
  daysPerWeek: number;
  level: string;
}

export interface GuideForPrompt {
  title: string;
  category: string;
  body_md: string;
}

function buildUserPrompt(guide: GuideForPrompt, inputs: PersonalizeInputs) {
  return `Guide: "${guide.title}" (category: ${guide.category})

Guide body (markdown):
"""
${guide.body_md}
"""

Member's equipment: ${inputs.equipment.length > 0 ? inputs.equipment.join(", ") : "none listed"}
Member's schedule: ${inputs.daysPerWeek} days per week
Member's level: ${inputs.level}

Personalize this guide for the member and respond with the JSON object
described in your instructions.`;
}

// Haiku 4.5 sometimes wraps its JSON answer in a ```json fence despite the
// system prompt saying not to. Strip one if present; leave the text alone
// otherwise. This is the full extent of "cleanup" done here on purpose —
// anything past this is still the model's problem, not ours to paper over,
// so it's left for lib/plan-schema.ts (via the route) to reject.
function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1] : text;
}

// Returns the model's raw text response (fence-stripped). Deliberately does
// not parse or validate JSON here — that's lib/plan-schema.ts's job, called
// from the route, so a malformed response is a validation failure the route
// can turn into a 502, not an exception buried in this file.
export async function generatePlan(
  guide: GuideForPrompt,
  inputs: PersonalizeInputs,
): Promise<string> {
  // Haiku 4.5: fast, cheap tier for a bounded, template-shaped task
  // (adapt a known guide into a fixed JSON structure). It doesn't support
  // adaptive thinking or output_config.effort (those are 4.6+/Sonnet 5/
  // Opus-tier features) — omitted rather than sent and rejected.
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(guide, inputs) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("model returned no text content");
  }
  return stripCodeFence(textBlock.text);
}
