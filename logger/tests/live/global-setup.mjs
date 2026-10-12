import { liveGate } from "./gate.mjs";
import { LIVE_BASE_URL, PAGES_HOST } from "./project.mjs";

const MARKER = "<title>Insight</title>";

export default async function globalSetup() {
  const gate = liveGate(process.env);
  if (gate.skip) return;
  const url = new URL("index.html", LIVE_BASE_URL);
  let res;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error("Insight live check: the GitHub Pages app did not respond. Refusing to run.");
  }
  let finalHost = "";
  try { finalHost = new URL(res.url).hostname; }
  catch { finalHost = ""; }
  if (finalHost !== PAGES_HOST) {
    throw new Error("Insight live check was redirected off GitHub Pages. Refusing to run.");
  }
  const html = await res.text();
  if (!res.ok || !html.includes(MARKER)) {
    throw new Error(`Insight live check: GitHub Pages did not serve the Insight app (status ${res.status}). Refusing to run.`);
  }
}
