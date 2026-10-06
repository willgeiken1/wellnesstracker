// Warn when the pinned supabase-js devDependency is not the latest 2.x.
// The app requests the floating @2 CDN build; the stub serves the pin.
// This is a warning only. It needs the npm registry, so it runs outside the OS lock.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
const pinned = pkg.devDependencies && pkg.devDependencies["@supabase/supabase-js"];
if (!pinned) {
  console.warn("WARNING: @supabase/supabase-js is not pinned in devDependencies.");
  process.exit(0);
}
const res = await fetch("https://registry.npmjs.org/@supabase/supabase-js/latest");
if (!res.ok) {
  console.warn(`WARNING: could not read the latest supabase-js version (${res.status}). Pin remains ${pinned}.`);
  process.exit(0);
}
const latest = (await res.json()).version;
if (latest !== pinned) {
  console.warn(
    `WARNING: pinned @supabase/supabase-js@${pinned} is not latest 2.x (${latest}). ` +
    "index.html loads the floating @2 CDN build; the smoke stub serves the pin. " +
    "Drift can hide production client bugs. Bump the devDependency when you want smoke on the newer client."
  );
} else {
  console.log(`supabase-js pin ${pinned} matches latest ${latest}.`);
}
