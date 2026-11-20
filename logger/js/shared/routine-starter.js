/* Generic starter for a new account. The names are fake labels, not a
   person's stack. Each row is a check item. */

export const STARTER_BLOCKS = Object.freeze([
  Object.freeze({ key: "morning", name: "Morning routine" }),
  Object.freeze({ key: "stack", name: "Supplement & enhancer stack" }),
  Object.freeze({ key: "night", name: "Night routine" }),
]);

export const GENERIC_STARTER_ITEMS = Object.freeze([
  Object.freeze({ block: "morning", name: "Morning supplements" }),
  Object.freeze({ block: "morning", name: "Morning check" }),
  Object.freeze({ block: "stack", name: "Stack check" }),
  Object.freeze({ block: "night", name: "Night supplements" }),
  Object.freeze({ block: "night", name: "Night check" }),
]);

export const STARTER_BLOCK_KEYS = Object.freeze(STARTER_BLOCKS.map((block) => block.key));
