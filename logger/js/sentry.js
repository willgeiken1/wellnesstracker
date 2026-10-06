import { app } from "./runtime.js";
import { scrubBreadcrumb, scrubEvent, sentryUserId } from "./sentry-scrub.js";
import { onDevHost } from "./usage-events.js";
import { usageSharingOn } from "./usage-pref.js";

/* Insight shell release. Bump this together with the CACHE name in sw.js. */
export const SENTRY_RELEASE = "insight-shell-v38";

/* Errors only. The tracing build is larger and this app does not send traces. */
const SENTRY_SRC = "https://browser.sentry-cdn.com/10.42.0/bundle.min.js";
const SENTRY_INTEGRITY = "sha384-L/HYBH2QCeLyXhcZ0hPTxWMnyMJburPJyVoBmRk4OoilqrOWq5kU4PNTLFYrCYPr";

const DSN = "https://0afc21b09cad789f83621da6e37d8f9d@o4512196136206336.ingest.us.sentry.io/4512196143742976";

function sentryAllowed() {
  return usageSharingOn() && !onDevHost();
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
  if (!sentryAllowed()) return;
  if (booted) return;
  const Sentry = window.Sentry;
  if (!Sentry || typeof Sentry.init !== "function") return;
  booted = true;
  const integrations = [];
  if (typeof Sentry.breadcrumbsIntegration === "function") {
    integrations.push(Sentry.breadcrumbsIntegration({
      console: true,
      dom: { serializeAttribute: ["data-action", "data-tab"] },
      fetch: true,
      history: true,
      xhr: true,
      sentry: false,
    }));
  }
  try {
    Sentry.init({
      dsn: DSN,
      environment: "production",
      release: SENTRY_RELEASE,
      sendDefaultPii: false,
      /* Errors only. Tracing stays off so spans cannot carry a health value. */
      tracesSampleRate: 0,
      maxBreadcrumbs: 40,
      denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-extension:\/\//i, /^safari-web-extension:\/\//i],
      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        /^Script error\.?$/,
      ],
      integrations,
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
  if (!sentryAllowed()) return;
  ensureSentryScript();
  const script = document.querySelector("script[data-sentry]");
  if (script) script.addEventListener("load", boot);
  boot();
  if (booted || watchTimer) return;
  watchTimer = setInterval(() => {
    if (!sentryAllowed()) {
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
  if (!sentryAllowed()) return;
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
