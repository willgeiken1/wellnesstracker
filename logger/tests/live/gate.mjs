// Secret handling for the deployed-site checks.
// Values come from the environment only. Nothing here has a default credential.

export const PROBE_NAME = "Live Probe";
export const EMAIL_MARKER = "insight-live";

// Keep this in step with supabase/functions/delete-account/index.ts (KNOWN).
export const PURGE_TABLES = [
  "user_data",
  "oura_days",
  "oura_connections",
  "oura_tokens",
  "oura_oauth_states",
  "progress_photos",
  "ai_usage",
];

export function liveGate(env) {
  const email = typeof env.INSIGHT_TEST_EMAIL === "string" ? env.INSIGHT_TEST_EMAIL.trim() : "";
  const password = typeof env.INSIGHT_TEST_PASSWORD === "string" ? env.INSIGHT_TEST_PASSWORD : "";
  const serviceRole = typeof env.INSIGHT_TEST_SERVICE_ROLE_KEY === "string" ? env.INSIGHT_TEST_SERVICE_ROLE_KEY.trim() : "";
  if (!email || !password) {
    return {
      skip: true,
      reason: "INSIGHT_TEST_EMAIL or INSIGHT_TEST_PASSWORD is not set.",
      email: "",
      password: "",
      serviceRole: "",
    };
  }
  return { skip: false, reason: "", email, password, serviceRole };
}

export function throwawayEmailOk(email) {
  if (typeof email !== "string") return false;
  if (!email || email.length > 254 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || email.indexOf("@", at + 1) !== -1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!/^[A-Za-z0-9._+-]+$/.test(local)) return false;
  if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain)) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  return new RegExp(`(^|[.+_-])${EMAIL_MARKER}([.+_-]|$)`, "i").test(local);
}

export function passwordOk(password) {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > 200) return false;
  return !/[\u0000-\u001f\u007f]/.test(password);
}

export function assertConfigured(gate) {
  if (!gate || gate.skip) {
    throw new Error("INSIGHT_TEST_EMAIL or INSIGHT_TEST_PASSWORD is not set. Refusing to run.");
  }
  if (!throwawayEmailOk(gate.email)) {
    throw new Error(
      "INSIGHT_TEST_EMAIL must be a dedicated throwaway address whose local part contains insight-live as its own word, such as a plus-address. Refusing to run."
    );
  }
  if (!passwordOk(gate.password)) {
    throw new Error("INSIGHT_TEST_PASSWORD must be 8 to 200 characters and must not contain control characters. Refusing to run.");
  }
}

export function purgeSkippedOnSchedule(eventName) {
  return eventName === "schedule";
}

export function serviceRoleOk(serviceRole, publishableKey) {
  if (typeof serviceRole !== "string") return false;
  const key = serviceRole.trim();
  if (key.length < 20 || /\s/.test(key)) return false;
  if (publishableKey && key === publishableKey) return false;
  return true;
}

export function secretVariants(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || value.length < 3 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    try {
      const encoded = encodeURIComponent(value);
      if (encoded !== value && !seen.has(encoded)) {
        seen.add(encoded);
        out.push(encoded);
      }
    } catch { /* leave the raw value as the only variant */ }
  }
  return out.sort((a, b) => b.length - a.length);
}

export function redactText(text, secrets) {
  let out = String(text ?? "");
  for (const secret of secretVariants(secrets)) out = out.split(secret).join("[redacted]");
  return out;
}
