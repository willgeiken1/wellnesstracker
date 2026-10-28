/** Invented fixtures only. */
export const legacyV1 = {
  version: 1,
  templates: { Push: ["bench-press", "Fixture pulley"] },
  sessions: [
    {
      date: "2026-01-02",
      day: "Push",
      entries: [
        {
          exercise: "bench-press",
          sets: [
            { w: 100, r: 8 },
            {
              w: null,
              r: 5,
              uni: { l: { w: null, r: 5 }, r: { w: null, r: 6 } },
            },
          ],
        },
      ],
    },
  ],
  machineNotes: { "bench-press": " Seat 3 " },
};
export const legacyV2 = {
  app: "liftlog",
  version: 2,
  workouts: [
    { id: "push", name: "Push", exercises: [{ name: "Bench Press" }] },
  ],
  profile: {
    name: "Fixture",
    units: "metric",
    heightCm: 180,
    weighIns: [{ date: "2026-01-02", kg: 75 }],
  },
  sessions: [
    {
      id: "fixture-session",
      date: "2026-01-02",
      workoutId: "push",
      entries: [
        {
          exercise: "Bench Press",
          sets: [{ w: 40, r: 8, rpe: 7, tag: "warmup" }],
        },
      ],
    },
  ],
  food: {
    days: {
      "2026-01-02": [
        {
          id: "fixture-food",
          name: "Fixture oats",
          meal: "breakfast",
          base: { kcal: 100, p: 5, c: 15, f: 2 },
          servings: 2,
        },
      ],
    },
    saved: [],
    targets: { auto: false, kcal: 2000, p: 100 },
  },
  cardio: {
    sessions: [
      {
        id: "fixture-cardio",
        date: "2026-01-02",
        machine: "treadmill",
        segments: [{ min: 10, speed: 6 }],
      },
    ],
  },
  measurements: { "2026-01-02": { waist: 80, arms: 30, neck: 35 } },
  layout: {
    homeV2: {
      v: 2,
      items: ["today", "unknown-widget"],
      hidden: ["hrv"],
      sizes: { today: "wide" },
    },
  },
  machineNotes: {
    "Bench Press": { text: "Fixture note", at: 1 },
    Dips: { gone: true, at: 2 },
  },
  checkins: { "2026-01-02": { mood: "ignored-fixture" } },
  analytics: true,
  appLock: { enabled: true },
};
