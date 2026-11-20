import { app } from "../runtime.js";

/* On for the signed-in web app. Routines is PWA-only.
   The App Store app is Expo under native/. Do not add a Routines,
   Discover, or reconstitution route under native/src/app.
   Compile-time constant: do not read URL params, env vars, or localStorage to turn it on. */
export const ROUTINES_ENABLED = true;
app.ROUTINES_ENABLED = ROUTINES_ENABLED;
