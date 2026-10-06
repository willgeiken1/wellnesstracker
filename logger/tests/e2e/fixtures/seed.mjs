// Deterministic synthetic demo data. Nothing here is a real health value.
export const E2E_EMAIL = "insight.wellnessos+e2e@gmail.com";
export const E2E_PASSWORD = "synthetic-e2e-password";
export const E2E_USER_ID = "11111111-1111-4111-8111-111111111111";
export const E2E_NAME = "Alex Demo";

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function b64url(value) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(json).toString("base64url");
}

export function syntheticAccessToken(nowSec = Math.floor(Date.now() / 1000)) {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub: E2E_USER_ID,
    email: E2E_EMAIL,
    role: "authenticated",
    aud: "authenticated",
    exp: nowSec + 60 * 60 * 24 * 30,
    iat: nowSec,
  });
  return `${header}.${payload}.${b64url("synthetic-signature")}`;
}

export function syntheticUser(nowIso = "2026-01-15T12:00:00.000Z") {
  return {
    id: E2E_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: E2E_EMAIL,
    email_confirmed_at: nowIso,
    phone: "",
    confirmed_at: nowIso,
    last_sign_in_at: nowIso,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
    is_anonymous: false,
  };
}

export function syntheticSession() {
  const expiresIn = 60 * 60 * 24 * 30;
  return {
    access_token: syntheticAccessToken(),
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: "synthetic-refresh-token",
    user: syntheticUser(),
  };
}

// The shape cloud.js stores in user_data.data. Oura is intentionally absent.
export function syntheticBlob(day = utcDay()) {
  return {
    machineNotes: {},
    measurements: {},
    uniEx: {},
    layout: {},
    brief: null,
    weeklyReports: null,
    muscleMode: "basic",
    settingsAt: 2,
    cardio: { sessions: [], saved: [], goalMin: 150, deleted: [], live: null, updatedAt: 2 },
    food: {
      days: {
        [day]: [{
          id: "e2e-food-oats",
          meal: "breakfast",
          name: "Synthetic oats",
          base: { kcal: 320, p: 12, c: 54, f: 6 },
          servings: 1,
          src: "manual",
          at: `${day}T12:00:00.000Z`,
        }],
      },
      saved: [],
      targets: { auto: true },
      deleted: [],
      updatedAt: 2,
    },
    goals: { sessionsPerWeek: 3, lifts: {}, weightDir: null, updatedAt: 2 },
    theme: { mode: "dark", accent: "citrus" },
    profile: {
      name: E2E_NAME,
      dob: "1991-04-02",
      sex: "female",
      units: "imperial",
      heightCm: 170,
      activity: "light",
      weighIns: [{ date: day, kg: 70, at: `${day}T11:00:00.000Z` }],
      updatedAt: 2,
    },
    sessions: [],
    plan: {},
    restSeconds: 120,
    deleted: [],
    updatedAt: 2,
    planAt: {},
    appLock: { enabled: false, updatedAt: 0 },
    purges: [],
    checkins: null,
    checkinDeleted: [],
  };
}
