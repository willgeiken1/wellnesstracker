/* Default Claude model for food-photo and food-describe.
   Claude API ID for Claude Haiku 4.5, from
   https://docs.anthropic.com/en/docs/about-claude/models/overview
   The alias claude-haiku-4-5 only points at this dated snapshot.
   FOOD_MODEL overrides it. Plain JS so node tests and the edge functions share it. */

export const FOOD_MODEL_ID = "claude-haiku-4-5-20251001";
