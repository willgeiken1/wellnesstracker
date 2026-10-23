/**
 * Insight Daily design tokens — v0.1.1 (S1 draft, PLACEHOLDER VALUES).
 * Source of truth for colour, type, spacing, radius, motion and haptics (D1, D2).
 * Real values come from the S3 slider mockup via a proposal PR (D19, D23).
 * Codex never edits this file (D18). Figma mirrors it; this file wins (D24).
 */

export const TOKENS_VERSION = "0.1.1";

/**
 * Base colours, named by meaning (D3). Values are placeholders.
 * Leaves are `string`, not the base hex literals, so Dusk and Sandstone overrides typecheck.
 */
export const base: {
  color: {
    surface: { page: string; card: string; sheet: string };
    text: { primary: string; secondary: string; tertiary: string; onAccent: string };
    border: { subtle: string; default: string };
    accent: { default: string };
    status: { success: string; warning: string; danger: string };
    pillar: {
      training: string;
      food: string;
      recovery: string;
      sleep: string;
      water: string;
    };
  };
} = {
  color: {
    surface: { page: "#0B0D10", card: "#14171C", sheet: "#1A1E24" },
    text: { primary: "#F2F4F7", secondary: "#A9B0BB", tertiary: "#6E7683", onAccent: "#0B0D10" },
    border: { subtle: "#232831", default: "#2E3440" },
    accent: { default: "#7FB2FF" },
    status: { success: "#4CC38A", warning: "#F2B84B", danger: "#F26D6D" },
    pillar: {
      training: "#FF8A4C",
      food: "#7BD389",
      recovery: "#4F8FE8",
      sleep: "#A98BFF",
      water: "#4FC3F7",
    },
  },
};

export type ThemeName = "calm" | "dusk" | "sandstone";

/** Per-theme overrides (D4). Each theme sets its own pillar colours in the same hue family (D5). */
export const themes: Record<ThemeName, DeepPartial<typeof base>> = {
  calm: {},
  dusk: { color: { pillar: { training: "#FF7A3D", water: "#3FB4EA" } } },
  sandstone: {
    color: {
      surface: { page: "#F6F1E8", card: "#FFFFFF", sheet: "#FBF7F0" },
      text: { primary: "#1E1B16", secondary: "#5A5247", tertiary: "#8A8173", onAccent: "#FFFFFF" },
      pillar: { training: "#D9622B", food: "#3F9A55", recovery: "#3B78D8", sleep: "#6F52D9", water: "#1E8FC2" },
    },
  },
};

/**
 * Named type steps; sizes are the default Dynamic Type size and scale with it (D7).
 * iosTextStyle is the iOS text style that step follows (UIFont.TextStyle).
 */
export const type = {
  family: "Lexend", // FP10: Lexend only in v1
  numbers: { fontVariant: ["tabular-nums"] as const }, // D8: every number uses tabular figures
  step: {
    display: { size: 34, lineHeight: 40, weight: "700", iosTextStyle: "largeTitle" },
    title: { size: 22, lineHeight: 28, weight: "600", iosTextStyle: "title2" },
    headline: { size: 17, lineHeight: 22, weight: "600", iosTextStyle: "headline" },
    body: { size: 17, lineHeight: 24, weight: "400", iosTextStyle: "body" },
    callout: { size: 15, lineHeight: 20, weight: "400", iosTextStyle: "callout" },
    caption: { size: 12, lineHeight: 16, weight: "500", iosTextStyle: "caption1" },
  },
} as const;

/** 4 pt grid (D9). */
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;

/** 3 corner sizes (D10). */
export const radius = { small: 8, card: 16, sheet: 24 } as const;

/** Motion tokens per preset (D11). Intensity changes amount, never speed (FP28). */
export type MotionPreset = "basic" | "calm" | "lively";

/** One duration scale, shared by every preset. Intensity does not change these. */
export const motionDurationMs = { quick: 160, standard: 260, slow: 420 } as const;

export const motion: Record<MotionPreset, { durationMs: typeof motionDurationMs; curve: string; bounce: number }> = {
  basic: { durationMs: motionDurationMs, curve: "easeInOut", bounce: 0 },
  calm: { durationMs: motionDurationMs, curve: "easeOut", bounce: 0 },
  lively: { durationMs: motionDurationMs, curve: "spring", bounce: 0.15 }, // FP27/FP105
};

/** Named haptic moments (D13). Nothing buzzes unless it is listed here. */
export const haptics = {
  setDone: "impactLight",
  pr: "notificationSuccess",
  restEnd: "notificationWarning",
  unlock: "impactMedium",
  waterTick: "impactLight", // W11
  waterGoal: "notificationSuccess", // W11
  selectionDetent: "selection", // animation idea #23 / W6
} as const;

/** Icons: one line set, 2 stroke weights, 4 sizes (D14). */
export const icon = { strokeWidth: { regular: 1.5, bold: 2 }, size: [16, 20, 24, 28] as const } as const;

/** Contrast floors checked by the S2 test (D6). */
export const contrast = { text: 4.5, graphics: 3 } as const;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
