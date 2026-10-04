/* Home shows an Oura tile only when a score is already stored.
   A lapsed membership keeps those scores. No ring, and a revoked
   connection, do not get an empty placeholder tile. */
export function showOuraOnHome(status, hasScore) {
  if (status === "disconnected") return false;
  return !!hasScore;
}
