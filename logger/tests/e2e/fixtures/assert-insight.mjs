// Fail fast unless the URL we are about to test is this app.
// logger/index.html owns the marker: <title>Insight</title>.

const MARKER = "<title>Insight</title>";

export async function assertInsight(baseURL) {
  const url = new URL("/index.html", baseURL.endsWith("/") ? baseURL : baseURL + "/");
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  } catch (err) {
    const message = err && err.message ? err.message : err;
    throw new Error(`Insight check failed: ${url} did not respond (${message}). Refusing to run.`);
  }
  const html = await res.text();
  if (!res.ok || !html.includes(MARKER)) {
    throw new Error(
      `Refusing to run: ${url} is not the Insight app (missing ${MARKER}). ` +
      "Another process may be serving a different app on this port."
    );
  }
}

export default async function globalSetup(config) {
  const baseURL = config.projects && config.projects[0] && config.projects[0].use && config.projects[0].use.baseURL;
  if (!baseURL) throw new Error("Playwright config has no baseURL; cannot verify the Insight app.");
  await assertInsight(baseURL);
}
