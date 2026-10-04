import { app } from "./runtime.js";
import { scrubBreadcrumb, scrubEvent, sentryUserId, stripUrlQuery } from "./sentry-scrub.js";
import { usageSharingOn } from "./usage-pref.js";

/* Insight shell release. Bump this together with the CACHE name in sw.js. */
export const SENTRY_RELEASE = "insight-shell-v31";

const SENTRY_SRC = "https://browser.sentry-cdn.com/10.42.0/bundle.tracing.min.js";
const SENTRY_INTEGRITY = "sha384-DIqcfVcfIewrWiNWfVZcGWExO5v673hkkC5ixJnmAprAfJajpUDEAL35QgkOB5gw";

const DSN = "https://0afc21b09cad789f83621da6e37d8f9d@o4512196136206336.ingest.us.sentry.io/4512196143742976";

/* Same-origin only. Tracing headers are not attached to Supabase or other APIs. */
const TRACE_TARGETS = [/^\//, /^https?:\/\/localhost(?::\d+)?\//, /^https?:\/\/127\.0\.0\.1(?::\d+)?\//];

function sentryEnvironment() {
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return "localhost";
  return "production";
}

let pendingSession = null;
let booted = false;
let watchTimer = null;

function applyUser() {
  const Sentry = window.Sentry;
  if (!Sentry || typeof Sentry.setUser !== "function") return;
  const id = sentryUserId(pendingSession && pendingSession.user && pendingSession.user.id);
  if (id) Sentry.setUser({ id });
  else Sentry.setUser(null);
}

function syncSentryUser(session) {
  pendingSession = session || null;
  applyUser();
}
app.syncSentryUser = syncSentryUser;

function ensureSentryScript() {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-sentry]")) return;
  const script = document.createElement("script");
  script.async = true;
  script.dataset.sentry = "1";
  script.src = SENTRY_SRC;
  script.integrity = SENTRY_INTEGRITY;
  script.crossOrigin = "anonymous";
  script.addEventListener("load", boot);
  script.addEventListener("error", () => {});
  document.head.appendChild(script);
}

function boot() {
  if (!usageSharingOn()) return;
  if (booted) return;
  const Sentry = window.Sentry;
  if (!Sentry || typeof Sentry.init !== "function" || typeof Sentry.browserTracingIntegration !== "function") return;
  booted = true;
  const environment = sentryEnvironment();
  try {
  Sentry.init({
    dsn: DSN,
    environment,
    release: SENTRY_RELEASE,
    sendDefaultPii: false,
    /* Session Replay is not loaded. The tracing bundle has no replay code. */
    tracesSampleRate: environment === "localhost" ? 1 : 0.2,
    tracePropagationTargets: TRACE_TARGETS,
    maxBreadcrumbs: 40,
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i, /^safari-web-extension:\/\//i],
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      /^Script error\.?$/,
    ],
    integrations: [
      Sentry.browserTracingIntegration({
        tracePropagationTargets: TRACE_TARGETS,
        beforeStartSpan(context) {
          if (context && typeof context.name === "string") context.name = stripUrlQuery(context.name);
          return context;
        },
      }),
      Sentry.breadcrumbsIntegration({
        console: true,
        dom: { serializeAttribute: ["data-action", "data-tab"] },
        fetch: true,
        history: true,
        xhr: true,
        sentry: false,
      }),
    ],
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
    beforeSend(event) {
      return scrubEvent(event);
    },
    beforeSendTransaction(event) {
      return scrubEvent(event);
    },
  });
  } catch (e) {
    booted = false;
    return;
  }
  applyUser();
}

function watch() {
  if (!usageSharingOn()) return;
  ensureSentryScript();
  const script = document.querySelector("script[data-sentry]");
  if (script) script.addEventListener("load", boot);
  boot();
  if (booted || watchTimer) return;
  watchTimer = setInterval(() => {
    if (!usageSharingOn()) {
      clearInterval(watchTimer);
      watchTimer = null;
      return;
    }
    boot();
    if (booted) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  }, 50);
  setTimeout(() => {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
  }, 8000);
}

function startSentry() {
  watch();
}
app.startSentry = startSentry;

function stopSentry() {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
  booted = false;
  const Sentry = window.Sentry;
  if (!Sentry || typeof Sentry.close !== "function") return;
  try {
    const pending = Sentry.close();
    if (pending && typeof pending.then === "function") pending.catch(() => {});
  } catch (e) {}
}
app.stopSentry = stopSentry;
