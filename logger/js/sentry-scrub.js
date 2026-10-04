/* Privacy scrubbers for Sentry. Insight is a health app: events may include
   a Supabase user id and technical context, and nothing else about the person.
   No emails, tokens, request bodies, URL query strings, or breadcrumb payloads
   that could carry food logs, notes, or other user content. */

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
    if (typeof breadcrumb.message === "string") next.message = stripUrlQuery(scrubString(breadcrumb.message));
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
