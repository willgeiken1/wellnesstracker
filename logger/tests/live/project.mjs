// The live checks talk only to the deployed GitHub Pages app and the Supabase
// project already compiled into logger/js/shared/cloud.js.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cloudPath = join(dirname(fileURLToPath(import.meta.url)), "../../js/shared/cloud.js");
const cloud = readFileSync(cloudPath, "utf8");

function readConst(name) {
  const match = cloud.match(new RegExp(`const ${name} = "([^"]+)"`));
  if (!match) throw new Error(`Could not read ${name} from logger/js/shared/cloud.js.`);
  return match[1];
}

export const SB_URL = readConst("SB_URL");
export const SB_PUBLISHABLE_KEY = readConst("SB_KEY");
export const PAGES_HOST = "willgeiken1.github.io";
export const LIVE_BASE_URL = `https://${PAGES_HOST}/wellnesstracker/logger/`;
export const SUPABASE_HOST = new URL(SB_URL).host;
export const EXPECTED_SUPABASE_HOST = "pvodxxmfgflvgvbdotlv.supabase.co";

if (SUPABASE_HOST !== EXPECTED_SUPABASE_HOST) {
  throw new Error("Refusing to run live checks: cloud.js does not point at the known Supabase project.");
}
