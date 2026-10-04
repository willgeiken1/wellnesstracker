/* Local-day check for AI caps. Plain JS so node tests and the edge function share it.
   The quota bucket is the server's date in the phone's time zone. The phone's date
   has to be that day or the day beside it, which covers clock skew and midnight. */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ZONE = /^[A-Za-z0-9_+\/-]{1,64}$/;

export function validDay(s) {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === s;
}

export function dayDistance(a, b) {
  const ms = Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z");
  return Math.round(ms / 86400000);
}

export function serverLocalDay(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : "";
  };
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/* Returns { day } or { error }. day is the server's local date, not the phone's claim. */
export function resolveQuotaDay(localDate, timeZone, now = new Date()) {
  if (!validDay(localDate)) return { error: "Send today's date from your phone." };
  if (typeof timeZone !== "string" || !ZONE.test(timeZone)) {
    return { error: "Send your time zone so the daily limit resets at your midnight." };
  }
  let serverDay;
  try {
    serverDay = serverLocalDay(timeZone, now);
  } catch (e) {
    return { error: "That time zone isn't recognized." };
  }
  if (!validDay(serverDay)) return { error: "That time zone isn't recognized." };
  if (Math.abs(dayDistance(serverDay, localDate)) > 1) {
    return { error: "That date doesn't match your time zone. Check the clock on this phone." };
  }
  return { day: serverDay };
}
