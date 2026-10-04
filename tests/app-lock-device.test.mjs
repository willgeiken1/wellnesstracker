import assert from "node:assert/strict";
import test from "node:test";

/* Loads state.js, cloud.js, and privacy.js through the shared runtime. Each simulated phone swaps in its own localStorage. */
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
globalThis.localStorage = memoryStorage();
globalThis.window = globalThis;
const lockEl = { hidden: true, dataset: {}, innerHTML: "" };
globalThis.document = {
  addEventListener() {},
  documentElement: { dataset: {}, classList: { remove() {} } },
  body: { classList: { add() {} } },
  querySelector: () => null,
};
const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
await import("../logger/js/shared/cloud.js");
await import("../logger/js/pages/privacy.js");
app.schedulePush = () => {};
app.render = () => {};
app.esc = (s) => String(s);
app.$ = (sel) => (sel === "#lock" ? lockEl : null);
app.ui = app.ui || {};

const OWNER = "11111111-1111-4111-8111-111111111111";
const clone = (v) => JSON.parse(JSON.stringify(v));

/* Pushes once through the real cloudPush and returns the blob the server received. */
async function pushedBlob() {
  let blob = null;
  app.session = { user: { id: OWNER } };
  app.sb = { rpc: async (_name, args) => { blob = clone(args.p_data); return { data: {}, error: null }; } };
  await app.cloudPush();
  return blob;
}

test("the cloud blob never contains the credentialId", async () => {
  app.state.ownerId = OWNER;
  app.state.appLock = { enabled: true, method: "platform", credentialId: "CRED-LEGACY", updatedAt: 5 };
  const blob = await pushedBlob();
  assert.deepEqual(blob.appLock, { enabled: true, method: "platform", updatedAt: 5 });
  assert.equal(JSON.stringify(blob).includes("CRED-LEGACY"), false);
  assert.equal(JSON.stringify(blob).includes("credentialId"), false);
});

test("turning the lock on keeps the credential on this phone only", async () => {
  globalThis.localStorage = memoryStorage();
  app.state.ownerId = OWNER;
  app.turnLockOn({ method: "platform", credentialId: "CRED-A" });
  assert.equal(app.state.appLock.credentialId, undefined);
  assert.equal(app.state.appLock.enabled, true);
  assert.equal(app.state.appLock.method, "platform");
  assert.equal(globalThis.localStorage.getItem("insight-lock-cred:" + OWNER), "CRED-A");
  assert.equal(globalThis.localStorage.getItem(app.KEY).includes("CRED-A"), false);
  const blob = await pushedBlob();
  assert.equal(JSON.stringify(blob).includes("CRED-A"), false);
});

test("a synced credentialId is ignored and this phone's credential is untouched", () => {
  globalThis.localStorage = memoryStorage({ ["insight-lock-cred:" + OWNER]: "MINE" });
  app.state.ownerId = OWNER;
  app.state.appLock = { enabled: false, updatedAt: 1 };
  app.mergeRemote({ appLock: { enabled: true, method: "platform", credentialId: "OTHER-PHONE", passcodeHash: "abc", updatedAt: 99 } });
  assert.deepEqual(app.state.appLock, { enabled: true, method: "platform", passcodeHash: "abc", updatedAt: 99 });
  assert.equal(app.localLockCred(), "MINE");
});

test("the local credential is stored per account", () => {
  globalThis.localStorage = memoryStorage();
  assert.equal(app.lockCredKey("owner-1"), "insight-lock-cred:owner-1");
  assert.equal(app.lockCredKey(null), "insight-lock-cred:local");
  app.setLocalLockCred("C1", "owner-1");
  app.setLocalLockCred("C2", "owner-2");
  app.state.ownerId = "owner-1";
  assert.equal(app.localLockCred(), "C1");
  app.state.ownerId = "owner-2";
  assert.equal(app.localLockCred(), "C2");
  app.state.ownerId = "owner-3";
  assert.equal(app.localLockCred(), null);
  app.state.ownerId = "owner-2";
  app.setLocalLockCred(null);
  assert.equal(app.localLockCred(), null);
  assert.equal(app.localLockCred("owner-1"), "C1");
});

test("an older build's credentialId moves out of app state and never overwrites a local one", () => {
  globalThis.localStorage = memoryStorage();
  app.state.ownerId = OWNER;
  app.state.appLock = { enabled: true, method: "platform", credentialId: "OLD", passcodeHash: null, updatedAt: 3 };
  app.adoptLegacyLockCred();
  assert.equal(app.localLockCred(), "OLD");
  assert.deepEqual(app.state.appLock, { enabled: true, method: "platform", updatedAt: 3 });

  globalThis.localStorage = memoryStorage({ ["insight-lock-cred:" + OWNER]: "MINE" });
  app.state.appLock = { enabled: true, method: "platform", credentialId: "SYNCED", updatedAt: 4 };
  app.adoptLegacyLockCred();
  assert.equal(app.localLockCred(), "MINE");
  assert.equal("credentialId" in app.state.appLock, false);
});

function renderLockFor(lock, cred) {
  globalThis.localStorage = memoryStorage(cred ? { ["insight-lock-cred:" + OWNER]: cred } : {});
  app.state.ownerId = OWNER;
  app.state.appLock = lock;
  app.ui.lockMode = undefined;
  app.ui.lockMsg = "";
  app.ui.lockBioFailed = false;
  app.renderLock(true);
  return lockEl.innerHTML;
}

test("a phone without the credential is offered setup or the passcode, never only a dead end", () => {
  const noPass = renderLockFor({ enabled: true, method: "platform", updatedAt: 1 }, null);
  assert.match(noPass, /data-action="lock-setup"[^>]*>Set up Face ID on this phone</);
  assert.match(noPass, /data-action="lock-relogin"/);
  assert.doesNotMatch(noPass, /data-action="lock-bio"/);

  const withPass = renderLockFor({ enabled: true, method: "platform", passcodeHash: "h", updatedAt: 1 }, null);
  assert.match(withPass, /data-action="lock-code-go"/);
  assert.match(withPass, /data-action="lock-setup"/);
  assert.match(withPass, /data-action="lock-relogin"/);

  const mine = renderLockFor({ enabled: true, method: "platform", updatedAt: 1 }, "MINE");
  assert.match(mine, /data-action="lock-bio"/);
  assert.doesNotMatch(mine, /lock-setup/);
});

test("setting up Face ID on this phone stores a local credential and leaves the synced lock alone", async () => {
  globalThis.localStorage = memoryStorage();
  app.state.ownerId = OWNER;
  app.state.appLock = { enabled: true, method: "platform", updatedAt: 7 };
  const before = clone(app.state.appLock);
  const realRegister = app.registerPlatformKey;
  const realUnlocked = app.markUnlocked;
  const realToast = app.toast;
  let unlocked = 0;
  globalThis.PublicKeyCredential = function () {};
  Object.defineProperty(globalThis, "navigator", { value: { credentials: { create() {}, get() {} } }, configurable: true, writable: true });
  app.registerPlatformKey = async () => "NEW-HERE";
  app.markUnlocked = () => { unlocked++; };
  app.toast = () => {};
  try {
    await app.setupDeviceLock();
    assert.equal(app.localLockCred(), "NEW-HERE");
    assert.deepEqual(app.state.appLock, before);
    assert.equal(unlocked, 1);

    // No platform authenticator and no passcode: fall back to signing in, never a lockout.
    globalThis.localStorage = memoryStorage();
    app.registerPlatformKey = async () => { const e = new Error("no"); e.name = "NotSupportedError"; throw e; };
    await app.setupDeviceLock();
    assert.equal(app.localLockCred(), null);
    assert.equal(app.ui.lockMode, "relogin");
    assert.match(lockEl.innerHTML, /data-action="lock-signin"/);
  } finally {
    app.registerPlatformKey = realRegister;
    app.markUnlocked = realUnlocked;
    app.toast = realToast;
    delete globalThis.PublicKeyCredential;
    app.ui.lockMode = undefined;
  }
});

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("randomized merge orders across three phones keep every credential on its own phone", async () => {
  const rnd = rng(0xA11CE);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const baseState = clone(app.state);
  for (let round = 0; round < 120; round++) {
    let clock = 1000;
    const phones = [0, 1, 2].map((n) => ({
      n,
      storage: memoryStorage(),
      state: { ...clone(baseState), ownerId: OWNER, appLock: { enabled: false, updatedAt: 0 } },
      mine: new Set(),
    }));
    // The server may still hold an older build's blob with a credentialId in it.
    let server = rnd() < 0.5 ? { appLock: { enabled: true, method: "platform", credentialId: "LEGACY-" + round, updatedAt: 500 } } : {};
    const allCreds = new Set(server.appLock ? [server.appLock.credentialId] : []);
    const use = (p) => { globalThis.localStorage = p.storage; app.state = p.state; };
    app.session = { user: { id: OWNER } };
    app.sb = {
      rpc: async (_name, args) => {
        const incoming = args.p_data.appLock;
        if (!server.appLock || (incoming.updatedAt || 0) > (server.appLock.updatedAt || 0)) server = { ...server, appLock: clone(incoming) };
        return { data: {}, error: null };
      },
    };
    const steps = 8 + Math.floor(rnd() * 16);
    for (let s = 0; s < steps; s++) {
      const p = pick(phones);
      use(p);
      const op = rnd();
      const realNow = Date.now;
      Date.now = () => ++clock;
      try {
        if (op < 0.25) {
          const id = `CRED-${round}-${p.n}-${s}`;
          p.mine.add(id);
          allCreds.add(id);
          app.turnLockOn({ method: "platform", credentialId: id });
        } else if (op < 0.35) {
          app.turnLockOn({ method: "passcode", passcodeHash: "h" + s });
        } else if (op < 0.45) {
          app.state.appLock = { enabled: false, updatedAt: Date.now() };
          app.setLocalLockCred(null);
        } else if (op < 0.75) {
          await app.cloudPush();
        } else {
          app.mergeRemote(clone(server));
        }
      } finally {
        Date.now = realNow;
      }
      p.state = app.state;
      const label = `round ${round} step ${s} phone ${p.n}`;
      for (const q of phones) {
        assert.equal(q.state.appLock && "credentialId" in q.state.appLock, false, label);
        const saved = q.storage.getItem(app.KEY) || "";
        const local = q.storage.data["insight-lock-cred:" + OWNER] || null;
        if (local) assert.ok(q.mine.has(local), `${label}: phone ${q.n} holds ${local}`);
        for (const id of allCreds) {
          assert.equal(JSON.stringify(q.state).includes(id), false, `${label}: ${id} in state of phone ${q.n}`);
          assert.equal(saved.includes(id), false, `${label}: ${id} in saved state of phone ${q.n}`);
        }
      }
      for (const id of allCreds) {
        if (id.startsWith("LEGACY-")) continue;
        assert.equal(JSON.stringify(server).includes(id), false, `${label}: ${id} reached the server`);
      }
    }
  }
});
