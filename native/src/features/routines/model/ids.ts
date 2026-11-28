/* Row ids for daily routines.

   Every row id in the phone database is UUID-shaped. The web app names a log
   log_<itemId>_<day> so two phones that log the same item on the same day write
   the same row. Here the same idea is a UUID made from a hash of the same
   parts, so two phones still pick one id and the row validator accepts it. */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits));
}

/* UTF-8 by hand, so this file needs no TextEncoder. A lone surrogate becomes U+FFFD, as TextEncoder does. */
function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    let point = char.codePointAt(0) as number;
    if (point >= 0xd800 && point <= 0xdfff) point = 0xfffd;
    if (point < 0x80) out.push(point);
    else if (point < 0x800) out.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    else if (point < 0x10000) out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    else out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 63), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
  }
  return Uint8Array.from(out);
}

/* Sync SHA-256, the same steps as the web app's. */
export function sha256Hex(text: string): string {
  const data = utf8(text);
  const paddedLen = ((data.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = data.length * 8;
  view.setUint32(paddedLen - 8, Math.floor(bits / 0x100000000), false);
  view.setUint32(paddedLen - 4, bits >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isRoutineRowId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/* The same parts always give the same id, on every phone. The parts are joined with a zero byte, so
   ("a", "bc") and ("ab", "c") do not collide. Nothing about the parts can be read back from the id. */
export function routineUuid(...parts: string[]): string {
  const hex = sha256Hex(`insight-daily-routines\0${parts.join("\0")}`);
  const variant = "89ab"[parseInt(hex[16], 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/* One check-off row per item and day, and one rest row per day. Two phones
   that log the same item before a sync write the same id, so one row is kept. */
export function routineLogId(itemId: string | null | undefined, day: string): string {
  const dayText = typeof day === "string" ? day : "";
  return typeof itemId === "string" && itemId ? routineUuid("log", itemId, dayText) : routineUuid("rest", dayText);
}

/* One placement per item and block. Two phones that add the same item to the
   same routine write the same id, so it cannot show twice. */
export function routinePlacementId(blockId: string, itemId: string): string {
  return routineUuid("place", blockId, itemId);
}

/* Default routines have fixed ids, so two phones that seed an empty store at
   the same time end with one set. A deleted default keeps its id as a
   tombstone, so it is never seeded again. */
export const DEFAULT_BLOCK_IDS = Object.freeze({
  morning: routineUuid("block", "default", "morning"),
  night: routineUuid("block", "default", "night"),
});

/* Each owner has one prefs row. */
export const ROUTINE_PREFS_ID = routineUuid("prefs");

/* An item's custom type is "type_" plus the id of its daily_types row. */
export function customTypeId(rowId: string): string {
  return `type_${rowId}`;
}

export function customTypeRowId(typeId: unknown): string {
  if (typeof typeId !== "string" || !typeId.startsWith("type_")) return "";
  const rowId = typeId.slice(5);
  return isRoutineRowId(rowId) ? rowId : "";
}
