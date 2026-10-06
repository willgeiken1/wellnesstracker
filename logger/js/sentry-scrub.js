/* Privacy scrubbers for Sentry. Insight is a health app: events may include
   a Supabase user id and technical context, and nothing else about the person.
   No emails, tokens, request bodies, URL query strings, or breadcrumb payloads
   that could carry food logs, notes, or other user content.
   Health values (HRV, readiness, sleep, weight, kcal, protein, meal or note
   text) are stripped from free-text fields. Unknown extra and context keys
   are dropped. */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const TOKEN_PARAM_RE = /\b(access_token|refresh_token|id_token|token)=([^&\s#]+)/gi;

export function stripUrlQuery(value) {
  if (typeof value !== "string" || !value.includes("?")) return value;
  return value
    .replace(/(https?:\/\/[^\s?#]+)\?[^\s#]*/gi, "$1")
    .replace(/(^|\s)(\/[^\s?#]*)\?[^\s#]*/g, "$1$2");
}

export function scrubString(value) {
  if (typeof value !== "string") return value;
  const redacted = value
    .replace(EMAIL_RE, "[email]")
    .replace(JWT_RE, "[token]")
    .replace(BEARER_RE, "Bearer [token]")
    .replace(TOKEN_PARAM_RE, "$1=[token]");
  return stripUrlQuery(redacted);
}

function dropKey(key) {
  if (typeof key !== "string") return false;
  const k = key.toLowerCase();
  if (k === "headers" || k === "cookies" || k === "cookie" || k === "vars") return true;
  if (k === "email" || k === "e-mail" || k === "username" || k === "ip_address" || k === "ip") return true;
  if (k === "password" || k === "passwd" || k === "secret" || k === "api_key" || k === "apikey") return true;
  if (k === "query_string" || k === "querystring" || k === "http.query") return true;
  if (k === "body" || k.endsWith(".body") || k.endsWith("_body")) return true;
  if (k.includes("cookie") || k.includes("authorization") || k.includes("password")) return true;
  if (k.endsWith("token") || k.endsWith(".query")) return true;
  return false;
}

export function scrubData(value, depth = 0) {
  if (depth > 8) return null;
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object" || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => scrubData(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (dropKey(key)) continue;
    out[key] = scrubData(item, depth + 1);
  }
  return out;
}

const HEALTH_WORD = "\\b(?:hrv|readiness|sleep(?:[\\s_-]*score)?|weigh(?:[\\s-]*in)?|weights?(?:[\\s_-]*kg)?|kcals?|calories?|proteins?|meals?|notes?)\\b";

function hasHealthWord(value) {
  return new RegExp(HEALTH_WORD, "i").test(value);
}

/* Numbers are measurements. Health words name the measurement or the note. */
function stripHealthText(value) {
  if (typeof value !== "string") return "";
  const stripped = value
    .replace(new RegExp(HEALTH_WORD, "gi"), " ")
    .replace(/\d+(?:[.,]\d+)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/[A-Za-z0-9]/.test(stripped)) return "";
  return stripped;
}

function isHealthKey(key) {
  return hasHealthWord(String(key).replace(/[._-]+/g, " "));
}

/* Nothing the app sends belongs in extra. SDK contexts below are technical. */
const EXTRA_ALLOW = new Set();
const CONTEXT_ALLOW = new Set(["app", "browser", "culture", "device", "gpu", "os", "runtime", "trace"]);
const TAG_ALLOW = new Set([
  "browser", "browser.name", "os", "os.name", "device", "device.family",
  "level", "handled", "mechanism", "environment", "release", "url", "transaction", "user",
]);
const TX_PART = /^(?:index\.html|logger|home|workouts|food|progress|insights|settings|cardio)$/i;
const SAFE_FINGERPRINT = /^(?:\{\{\s*default\s*\}\}|[A-Za-z][A-Za-z0-9_]{0,63})$/;

function allowKeys(obj, allow) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!allow.has(String(key).toLowerCase())) continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function dropHealthKeys(value, depth = 0) {
  if (depth > 8 || value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => dropHealthKeys(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isHealthKey(key)) continue;
    out[key] = dropHealthKeys(item, depth + 1);
  }
  return out;
}

function scrubTags(tags) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return null;
  const out = {};
  for (const [key, value] of Object.entries(tags)) {
    if (!TAG_ALLOW.has(String(key).toLowerCase())) continue;
    if (typeof value === "boolean") { out[key] = value; continue; }
    if (typeof value !== "string") continue;
    const clean = stripHealthText(value);
    if (!clean) continue;
    out[key] = clean;
  }
  return Object.keys(out).length ? out : null;
}

function scrubFingerprint(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    if (typeof item !== "string" || hasHealthWord(item) || /\d/.test(item)) continue;
    if (!SAFE_FINGERPRINT.test(item)) continue;
    out.push(item);
  }
  return out.length ? out : null;
}

function scrubTransaction(value) {
  if (typeof value !== "string") return undefined;
  const path = stripUrlQuery(value).split("#")[0];
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return path.startsWith("/") ? "/" : undefined;
  const kept = [];
  for (const part of parts) {
    if (!TX_PART.test(part)) break;
    kept.push(part);
  }
  if (!kept.length) return undefined;
  return "/" + kept.join("/");
}

function safeErrorType(type) {
  if (typeof type !== "string") return "Error";
  if (!/^[A-Za-z_$][\w$]{0,80}$/.test(type)) return "Error";
  if (hasHealthWord(type) || /\d/.test(type)) return "Error";
  return type;
}

function scrubException(exception) {
  if (!exception || typeof exception !== "object" || !Array.isArray(exception.values)) return;
  exception.values = exception.values.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const type = safeErrorType(entry.type);
    return { ...entry, type, value: type };
  });
}

function scrubLogentry(event) {
  const entry = event.logentry;
  if (!entry || typeof entry !== "object") return;
  for (const key of ["message", "formatted"]) {
    if (typeof entry[key] !== "string") continue;
    const clean = stripHealthText(entry[key]);
    if (clean) entry[key] = clean;
    else delete entry[key];
  }
}

function scrubFetchMessage(message) {
  const stripped = stripUrlQuery(scrubString(message));
  const match = stripped.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)/i);
  if (!match) {
    const clean = stripHealthText(stripped);
    return clean || undefined;
  }
  const url = stripHealthText(match[2]);
  return url ? `${match[1].toUpperCase()} ${url}` : match[1].toUpperCase();
}

const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Supabase user ids are UUIDs. Anything else, including an email, is dropped. */
export function sentryUserId(id) {
  return typeof id === "string" && USER_ID_RE.test(id) ? id : undefined;
}

export function scrubEvent(event) {
  if (!event || typeof event !== "object") return event;
  const keptId = sentryUserId(event.user && event.user.id);
  const next = scrubData(event);
  if (keptId) next.user = { id: keptId };
  else delete next.user;
  if (next.request) {
    delete next.request.cookies;
    delete next.request.headers;
    delete next.request.data;
    delete next.request.query_string;
    if (typeof next.request.url === "string") next.request.url = stripUrlQuery(next.request.url);
  }
  const extra = allowKeys(next.extra, EXTRA_ALLOW);
  if (extra) next.extra = dropHealthKeys(extra);
  else delete next.extra;
  const contexts = allowKeys(next.contexts, CONTEXT_ALLOW);
  if (contexts) next.contexts = dropHealthKeys(contexts);
  else delete next.contexts;
  const tags = scrubTags(next.tags);
  if (tags) next.tags = tags;
  else delete next.tags;
  const fingerprint = scrubFingerprint(next.fingerprint);
  if (fingerprint) next.fingerprint = fingerprint;
  else delete next.fingerprint;
  const transaction = scrubTransaction(next.transaction);
  if (transaction) next.transaction = transaction;
  else delete next.transaction;
  if (typeof next.message === "string") {
    const message = stripHealthText(next.message);
    if (message) next.message = message;
    else delete next.message;
  }
  scrubLogentry(next);
  scrubException(next.exception);
  if (Array.isArray(next.breadcrumbs)) next.breadcrumbs = next.breadcrumbs.map((crumb) => scrubBreadcrumb(crumb)).filter(Boolean);
  return next;
}

function httpData(data) {
  const src = data || {};
  const out = {};
  if (typeof src.method === "string") out.method = src.method;
  if (typeof src.status_code === "number") out.status_code = src.status_code;
  if (typeof src.url === "string") out.url = stripUrlQuery(src.url);
  return out;
}

export function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== "object") return null;
  const category = typeof breadcrumb.category === "string" ? breadcrumb.category : "";
  const next = {
    type: breadcrumb.type,
    category,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
  };
  if (category === "fetch" || category === "xhr" || breadcrumb.type === "http") {
    next.data = httpData(breadcrumb.data);
    if (typeof breadcrumb.message === "string") {
      const message = scrubFetchMessage(breadcrumb.message);
      if (message) next.message = message;
    }
    return next;
  }
  if (category === "navigation" || breadcrumb.type === "navigation") {
    const data = breadcrumb.data || {};
    next.data = {
      from: typeof data.from === "string" ? stripUrlQuery(data.from) : undefined,
      to: typeof data.to === "string" ? stripUrlQuery(data.to) : undefined,
    };
    return next;
  }
  if (category.startsWith("ui.")) {
    next.message = category;
    return next;
  }
  /* Console text and hand-added breadcrumb messages can be food logs, notes, or emails.
     Keep the category so the trail is still useful, and drop the content. */
  return next;
}
