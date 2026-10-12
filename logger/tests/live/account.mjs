// Creates or signs in the throwaway account, then proves the delete removed it.
// The service role is used only for that one address: confirm it, and after
// delete count its own rows. Queries always filter on the captured user id.
// Nothing in the returned errors includes row contents, tokens, or the key.

import { createClient } from "@supabase/supabase-js";
import { assertConfigured, PURGE_TABLES, serviceRoleOk, throwawayEmailOk } from "./gate.mjs";
import { SB_PUBLISHABLE_KEY, SB_URL } from "./project.mjs";

export { PURGE_TABLES };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROGRESS_BUCKET = "progress";

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
  if (typeof userId !== "string" || !UUID.test(userId)) {
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

export async function countRowsForUser(admin, table, userId) {
  assertUuid(userId);
  if (!PURGE_TABLES.includes(table)) throw new Error("Refusing to query an unexpected table.");
  const { count, error } = await admin
    .from(table)
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    const missing = /does not exist|schema cache|could not find the table/i.test(String(error.message || ""));
    if (missing) return 0;
    throw new Error(`Could not count ${table} after delete (status ${statusOf(error)}).`);
  }
  if (typeof count !== "number") throw new Error(`Could not count ${table} after delete.`);
  return count;
}

async function assertStorageEmpty(admin, userId) {
  assertUuid(userId);
  const listed = await admin.storage.from(PROGRESS_BUCKET).list(userId, { limit: 100 });
  if (listed.error) {
    const msg = String(listed.error.message || "");
    if (/not found/i.test(msg)) return;
    throw new Error(`Could not list progress storage (status ${statusOf(listed.error)}).`);
  }
  const names = (listed.data || [])
    .map((item) => item && item.name)
    .filter((name) => name && name !== ".emptyFolderPlaceholder");
  if (names.length) {
    throw new Error(`progress storage still has ${names.length} object(s) for the deleted test user.`);
  }
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
}
