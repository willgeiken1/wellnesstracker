// Creates or signs in the throwaway account, then proves the delete removed it.
// The service role is used only for that one address: confirm it, and after
// delete count its own rows. Queries always filter on the captured user id.
// Nothing in the returned errors includes row contents, tokens, or the key.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertConfigured, EMAIL_MARKER, PURGE_TABLES, serviceRoleOk, throwawayEmailOk } from "./gate.mjs";
import { SB_PUBLISHABLE_KEY, SB_URL } from "./project.mjs";
import { deleteRefusal, pollUntil, probeLanded, requireCount, requireStorageList, throwawayUserIdOk } from "./purge-check.mjs";

export { PURGE_TABLES };

const PROGRESS_BUCKET = "progress";
const PROBE_DAY = "2020-01-15";
const PROBE_FILE = "live-probe.jpg";
const PROBE_TOKEN = "live-probe";

// Party columns. Tables omitted here are counted and seeded by user_id.
const ROW_KEYS = {
  friendships: ["requester_id", "addressee_id"],
  friend_invites: ["owner_id"],
  shared_items: ["owner_id"],
  comments: ["author_id"],
  reports: ["reporter_id"],
  blocks: ["blocker_id", "blocked_id"],
};

function partnerAddress() {
  return "social-partner+" + EMAIL_MARKER + "@example.com";
}
const TINY_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

function memoryStorage() {
  const bag = new Map();
  return {
    getItem: (key) => (bag.has(key) ? bag.get(key) : null),
    setItem: (key, value) => { bag.set(key, String(value)); },
    removeItem: (key) => { bag.delete(key); },
  };
}

function clientOptions() {
  return {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storage: memoryStorage(),
      storageKey: "insight-live-auth",
    },
  };
}

export function anonClient() {
  return createClient(SB_URL, SB_PUBLISHABLE_KEY, clientOptions());
}

export function adminClient(serviceRole) {
  if (!serviceRoleOk(serviceRole, SB_PUBLISHABLE_KEY)) {
    throw new Error("INSIGHT_TEST_SERVICE_ROLE_KEY is missing or is the publishable key. Not deleting.");
  }
  return createClient(SB_URL, serviceRole.trim(), clientOptions());
}

function assertUuid(userId) {
  if (!throwawayUserIdOk(userId)) {
    throw new Error("Refusing to query without the throwaway user id.");
  }
}

function assertSameEmail(actual, expected) {
  if (typeof actual !== "string" || actual.toLowerCase() !== expected.toLowerCase() || !throwawayEmailOk(actual)) {
    throw new Error("Refusing to continue: the account email did not match the throwaway address.");
  }
}

function statusOf(error) {
  if (!error || typeof error !== "object") return "unknown";
  return error.status || error.statusCode || "unknown";
}

function alreadyExists(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "email_exists" || code === "user_already_exists") return true;
  return /already been registered|already exists/i.test(String(error.message || ""));
}

function signInRejected(error) {
  if (!error) return false;
  const code = String(error.code || "");
  if (code === "invalid_credentials" || code === "email_not_confirmed" || code === "user_not_found") return true;
  const status = Number(error.status);
  return status === 400 || status === 401 || status === 422;
}

function userMissing(error) {
  if (!error) return false;
  if (String(error.code || "") === "user_not_found") return true;
  if (Number(error.status) === 404) return true;
  return /not found/i.test(String(error.message || ""));
}

async function mustSignIn(anon, email, password, userId) {
  const again = await anon.auth.signInWithPassword({ email, password });
  if (!again.data?.session || !again.data.user) {
    throw new Error(`Throwaway sign-in did not return a session (status ${statusOf(again.error)}). Not deleting.`);
  }
  assertSameEmail(again.data.user.email, email);
  if (again.data.user.id !== userId) {
    throw new Error("Refusing to continue: signed-in user did not match the throwaway account.");
  }
  await anon.auth.signOut().catch(() => {});
}

export async function ensureThrowawayUser({ email, password, serviceRole }) {
  assertConfigured({ skip: false, email, password });
  const anon = anonClient();
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.data?.session && signed.data.user) {
    assertSameEmail(signed.data.user.email, email);
    const userId = signed.data.user.id;
    assertUuid(userId);
    await anon.auth.signOut().catch(() => {});
    return { userId };
  }
  if (!signInRejected(signed.error)) {
    throw new Error(`Throwaway sign-in did not complete (status ${statusOf(signed.error)}). Not deleting.`);
  }
  const admin = adminClient(serviceRole);
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!created.error && created.data?.user) {
    assertSameEmail(created.data.user.email, email);
    assertUuid(created.data.user.id);
    await mustSignIn(anon, email, password, created.data.user.id);
    return { userId: created.data.user.id };
  }
  if (!alreadyExists(created.error)) {
    throw new Error(`Could not create the throwaway user (status ${statusOf(created.error)}). Not deleting.`);
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const linked = link.data && link.data.user;
  if (link.error || !linked || !linked.id) {
    throw new Error(`The throwaway address already exists and could not be loaded (status ${statusOf(link.error)}). Not deleting.`);
  }
  assertSameEmail(linked.email, email);
  assertUuid(linked.id);
  const updated = await admin.auth.admin.updateUserById(linked.id, {
    password,
    email_confirm: true,
  });
  if (updated.error || !updated.data?.user) {
    throw new Error(`Could not confirm the existing throwaway account (status ${statusOf(updated.error)}). Not deleting.`);
  }
  assertSameEmail(updated.data.user.email, email);
  await mustSignIn(anon, email, password, linked.id);
  return { userId: linked.id };
}

function ownedColumns(table) {
  return ROW_KEYS[table] || ["user_id"];
}

function filterByUser(query, table, userId) {
  const columns = ownedColumns(table);
  if (columns.length === 1) return query.eq(columns[0], userId);
  return query.or(columns.map((column) => column + ".eq." + userId).join(","));
}

export async function countRowsForUser(admin, table, userId) {
  assertUuid(userId);
  if (!PURGE_TABLES.includes(table)) throw new Error("Refusing to query an unexpected table.");
  const columns = ownedColumns(table);
  const query = filterByUser(
    admin.from(table).select(columns[0], { count: "exact", head: true }),
    table,
    userId
  );
  const { count, error } = await query;
  return requireCount(table, error, count);
}

async function ensurePartner(admin) {
  const email = partnerAddress();
  const created = await admin.auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (!created.error && created.data?.user?.id) {
    assertUuid(created.data.user.id);
    if (!throwawayEmailOk(created.data.user.email)) {
      throw new Error("Refusing to keep a social probe account whose address is not a throwaway.");
    }
    return created.data.user.id;
  }
  if (!alreadyExists(created.error)) {
    throw new Error(`Could not create the social probe account (status ${statusOf(created.error)}).`);
  }
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const linked = link.data && link.data.user;
  if (link.error || !linked || !linked.id) {
    throw new Error(`Could not load the social probe account (status ${statusOf(link.error)}).`);
  }
  assertUuid(linked.id);
  if (!throwawayEmailOk(linked.email)) {
    throw new Error("Refusing to keep a social probe account whose address is not a throwaway.");
  }
  return linked.id;
}

async function removePartner(admin) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: partnerAddress() });
  const linked = link.data && link.data.user;
  if (link.error || !linked || !linked.id) return;
  const removed = await admin.auth.admin.deleteUser(linked.id);
  if (removed.error && !userMissing(removed.error)) {
    throw new Error(`Could not remove the social probe account (status ${statusOf(removed.error)}).`);
  }
}

async function seedSocial(admin, userId) {
  const partnerId = await ensurePartner(admin);
  if (partnerId === userId) throw new Error("Refusing to seed a social probe that is the throwaway account.");
  const expires = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
  const token = userId.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(token)) throw new Error("Refusing to seed an invite without a user id.");

  if (await countRowsForUser(admin, "social_settings", userId) < 1) {
    await mustWrite("social_settings", admin.from("social_settings").upsert(
      { user_id: userId, enabled: false },
      { onConflict: "user_id" }
    ));
  }
  if (await countRowsForUser(admin, "friend_invites", userId) < 1) {
    await mustWrite("friend_invites", admin.from("friend_invites").upsert(
      { token, owner_id: userId, expires_at: expires },
      { onConflict: "token" }
    ));
  }
  if (await countRowsForUser(admin, "friendships", userId) < 1) {
    await mustWrite("friendships", admin.from("friendships").insert({
      requester_id: userId,
      addressee_id: partnerId,
      status: "pending",
    }));
  }
  if (await countRowsForUser(admin, "blocks", userId) < 1) {
    await mustWrite("blocks", admin.from("blocks").upsert(
      { blocker_id: userId, blocked_id: partnerId },
      { onConflict: "blocker_id,blocked_id" }
    ));
  }
  if (await countRowsForUser(admin, "shared_items", userId) < 1) {
    await mustWrite("shared_items", admin.from("shared_items").insert({
      id: userId,
      owner_id: userId,
      kind: "workout_duration",
      workout_duration_seconds: 60,
    }));
  }
  const share = await admin.from("shared_items").select("id").eq("owner_id", userId).limit(1);
  const shareId = share.data && share.data[0] && share.data[0].id;
  if (share.error || !shareId) throw new Error(`Could not seed comments (status ${statusOf(share.error)}).`);
  if (await countRowsForUser(admin, "comments", userId) < 1) {
    await mustWrite("comments", admin.from("comments").insert({
      shared_item_id: shareId,
      author_id: userId,
      body: "probe",
    }));
  }
  if (await countRowsForUser(admin, "reactions", userId) < 1) {
    await mustWrite("reactions", admin.from("reactions").insert({
      shared_item_id: shareId,
      user_id: userId,
      kind: "like",
    }));
  }
  if (await countRowsForUser(admin, "reports", userId) < 1) {
    await mustWrite("reports", admin.from("reports").insert({
      reporter_id: userId,
      shared_item_id: shareId,
      reason: "probe",
    }));
  }
}

async function assertStorageEmpty(admin, userId) {
  assertUuid(userId);
  const listed = await admin.storage.from(PROGRESS_BUCKET).list(userId, { limit: 100 });
  const names = requireStorageList(listed.error, listed.data);
  if (names.length) {
    throw new Error(`progress storage still has ${names.length} object(s) for the deleted test user.`);
  }
}

async function mustWrite(table, write) {
  const { error } = await write;
  if (error) throw new Error(`Could not seed ${table} (status ${statusOf(error)}).`);
}

async function deleteRows(admin, userId) {
  for (const table of PURGE_TABLES) {
    const { error } = await filterByUser(admin.from(table).delete(), table, userId);
    if (error) throw new Error(`Could not delete ${table} during cleanup (status ${statusOf(error)}).`);
  }
}

async function removeProgress(admin, userId) {
  const listed = await admin.storage.from(PROGRESS_BUCKET).list(userId, { limit: 100 });
  const names = requireStorageList(listed.error, listed.data);
  if (!names.length) return;
  const removed = await admin.storage.from(PROGRESS_BUCKET).remove(names.map((name) => `${userId}/${name}`));
  if (removed.error) throw new Error(`Could not remove progress storage during cleanup (status ${statusOf(removed.error)}).`);
}

export async function deleteThrowawayAccount({ userId, email, serviceRole }) {
  const refusal = deleteRefusal({ email, userId });
  if (refusal === "email") throw new Error("Refusing to delete an account that is not the throwaway address.");
  if (refusal === "uuid") throw new Error("Refusing to query without the throwaway user id.");
  const admin = adminClient(serviceRole);
  const loaded = await admin.auth.admin.getUserById(userId);
  const user = loaded.data && loaded.data.user;
  if (user) {
    if (deleteRefusal({ email, userId, loadedEmail: user.email }) === "mismatch") {
      throw new Error("Refusing to continue: the account email did not match the throwaway address.");
    }
  }
  else if (loaded.error && !userMissing(loaded.error)) {
    throw new Error(`Could not load the throwaway account during cleanup (status ${statusOf(loaded.error)}).`);
  }
  await removeProgress(admin, userId);
  await deleteRows(admin, userId);
  if (user) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error && !userMissing(deleted.error)) {
      throw new Error(`Could not delete the throwaway account (status ${statusOf(deleted.error)}).`);
    }
  }
  await removeProgress(admin, userId);
  await deleteRows(admin, userId);
  await removePartner(admin);
}

export async function seedPurgeTargets({ userId, serviceRole }) {
  assertUuid(userId);
  const admin = adminClient(serviceRole);
  await pollUntil(async () => {
    const { data, error } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`Could not read user_data before the purge check (status ${statusOf(error)}).`);
    return probeLanded(data);
  }, {
    timeoutMs: 20_000,
    intervalMs: 400,
    missing: "user_data was not written before the purge check.",
  });
  const soon = new Date(Date.now() + 3_600_000).toISOString();
  const photoPath = `${userId}/${PROBE_FILE}`;
  await mustWrite("oura_days", admin.from("oura_days").upsert(
    { user_id: userId, day: PROBE_DAY, data: { probe: 1 } },
    { onConflict: "user_id,day" }
  ));
  await mustWrite("oura_connections", admin.from("oura_connections").upsert(
    { user_id: userId, last_sync: new Date().toISOString() },
    { onConflict: "user_id" }
  ));
  await mustWrite("oura_tokens", admin.from("oura_tokens").upsert(
    { user_id: userId, access_token: PROBE_TOKEN, refresh_token: PROBE_TOKEN, expires_at: soon },
    { onConflict: "user_id" }
  ));
  await mustWrite("oura_oauth_states", admin.from("oura_oauth_states").upsert(
    { state: userId, user_id: userId },
    { onConflict: "state" }
  ));
  await mustWrite("progress_photos", admin.from("progress_photos").upsert(
    { id: userId, user_id: userId, day: PROBE_DAY, pose: "front", path: photoPath },
    { onConflict: "id" }
  ));
  await mustWrite("ai_usage", admin.from("ai_usage").upsert(
    { user_id: userId, day: PROBE_DAY, kind: "photo", count: 1 },
    { onConflict: "user_id,day,kind" }
  ));
  const uploaded = await admin.storage.from(PROGRESS_BUCKET).upload(photoPath, TINY_JPEG, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (uploaded.error) throw new Error(`Could not seed progress storage (status ${statusOf(uploaded.error)}).`);
  await seedSocial(admin, userId);
  for (const table of PURGE_TABLES) {
    const count = await countRowsForUser(admin, table, userId);
    if (count < 1) throw new Error(`${table} was not seeded.`);
  }
  const listed = await admin.storage.from(PROGRESS_BUCKET).list(userId, { limit: 100 });
  const names = requireStorageList(listed.error, listed.data);
  if (!names.includes(PROBE_FILE)) throw new Error("progress storage was not seeded.");
}

export async function assertAccountPurged({ userId, email, password, serviceRole }) {
  assertConfigured({ skip: false, email, password });
  assertUuid(userId);
  const anon = anonClient();
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.data?.session) {
    await anon.auth.signOut().catch(() => {});
    throw new Error("The deleted throwaway account still accepts a password.");
  }
  const admin = adminClient(serviceRole);
  const loaded = await admin.auth.admin.getUserById(userId);
  if (loaded.data?.user) throw new Error("The auth user still exists after delete.");
  if (loaded.error && !userMissing(loaded.error)) {
    throw new Error(`Could not confirm the auth user is gone (status ${statusOf(loaded.error)}).`);
  }
  for (const table of PURGE_TABLES) {
    const count = await countRowsForUser(admin, table, userId);
    if (count !== 0) throw new Error(`${table} still has ${count} row(s) for the deleted test user.`);
  }
  await assertStorageEmpty(admin, userId);
  await removePartner(admin);
}
