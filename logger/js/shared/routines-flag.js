import { app } from "../runtime.js";

/* On for the signed-in web app. This flag is the web app's alone.
   The App Store app is Expo under native/ and has its own Routines tab:
   native/src/app/(tabs)/routines.tsx, with its screens in native/src/app/routines/.
   Those are the only routine routes there. Do not add a Discover route or a
   route named for a reconstitution calculator under native/src/app.
   Compile-time constant: do not read URL params, env vars, or localStorage to turn it on. */
export const ROUTINES_ENABLED = true;
app.ROUTINES_ENABLED = ROUTINES_ENABLED;
