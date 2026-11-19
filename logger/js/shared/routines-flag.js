import { app } from "../runtime.js";

/* Off until a later approved PR. Routines is PWA-only for now.
   The App Store app is Expo under native/. Do not add a Routines,
   Discover, or reconstitution route under native/src/app.
   Compile-time constant: do not read URL params, env vars, or localStorage to turn it on. */
export const ROUTINES_ENABLED = false;
app.ROUTINES_ENABLED = ROUTINES_ENABLED;
