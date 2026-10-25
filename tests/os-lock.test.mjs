import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = join(root, "logger/tests/e2e/with-os-lock.sh");

// Quotes, a newline, and a command substitution must survive the allowlist.
const sentinel = "a b'c\"d\n$(echo pwned)";

const probe = [
  "import json, os, socket",
  "external = 'open'",
  "sock = socket.socket()",
  "sock.settimeout(3)",
  "try:",
  "    sock.connect(('1.1.1.1', 443))",
  "except OSError as err:",
  "    external = 'closed:%s' % err.errno",
  "finally:",
  "    sock.close()",
  "print(json.dumps({",
  "    'home': os.environ.get('HOME'),",
  "    'sentinel': os.environ.get('PW_LOCK_PROBE'),",
  "    'dropped': os.environ.get('INSIGHT_LOCK_PROBE'),",
  "    'netns': os.environ.get('INSIGHT_NETNS'),",
  "    'lock_home': os.environ.get('INSIGHT_LOCK_HOME', ''),",
  "    'uid': os.getuid(),",
  "    'sudo_uid': os.environ.get('SUDO_UID'),",
  "    'external': external,",
  "    'path': os.environ.get('PATH', ''),",
  "    'ld_preload': os.environ.get('LD_PRELOAD'),",
  "    'ld_library_path': os.environ.get('LD_LIBRARY_PATH'),",
  "    'bash_env': os.environ.get('BASH_ENV'),",
  "    'env': os.environ.get('ENV'),",
  "    'ifs': os.environ.get('IFS'),",
  "    'shellopts': os.environ.get('SHELLOPTS'),",
  "    'bash_func': any(name.startswith('BASH_FUNC_') for name in os.environ),",
  "}))",
].join("\n");

function runLock(env) {
  return spawnSync("bash", [lock, "python3", "-c", probe], {
    encoding: "utf8",
    env,
  });
}

test("OS lock restores an allowlist and stays on loopback", () => {
  const scratch = mkdtempSync(join(tmpdir(), "os-lock-"));
  const bashEnv = join(scratch, "bash-env.sh");
  writeFileSync(bashEnv, "# sourced only if BASH_ENV is inherited\n");
  const result = runLock({
    ...process.env,
    TMPDIR: scratch,
    PW_LOCK_PROBE: sentinel,
    INSIGHT_LOCK_PROBE: "must-not-cross",
    SUDO_UID: "0",
    SUDO_GID: "0",
    LD_PRELOAD: "/no/such.so",
    LD_LIBRARY_PATH: "/tmp/not-a-lib-dir",
    BASH_ENV: bashEnv,
    ENV: bashEnv,
    IFS: "X",
    SHELLOPTS: "nounset",
    "BASH_FUNC_pwned%%": "() { echo PWNED; }",
  });
  assert.equal(result.status, 0, `status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /OS lock active: only loopback is present/);
  assert.doesNotMatch(result.stderr, /preserve-env is ignored/);
  const line = result.stdout.trim().split("\n").pop();
  const got = JSON.parse(line);
  assert.equal(got.home, process.env.HOME);
  assert.equal(got.sentinel, sentinel);
  assert.equal(got.dropped, null);
  assert.equal(got.netns, "1");
  assert.equal(got.lock_home, "");
  assert.equal(got.uid, process.getuid());
  assert.notEqual(got.uid, 0);
  assert.notEqual(got.sudo_uid, "0");
  assert.match(got.external, /^closed:/);
  const nodeDir = dirname(process.execPath);
  assert.ok(got.path.split(delimiter).includes(nodeDir), `PATH lost ${nodeDir}: ${got.path}`);
  assert.equal(got.ld_preload, null);
  assert.equal(got.ld_library_path, null);
  assert.equal(got.bash_env, null);
  assert.equal(got.env, null);
  assert.notEqual(got.ifs, "X");
  assert.notEqual(got.shellopts, "nounset");
  assert.equal(got.bash_func, false);
  assert.deepEqual(readdirSync(scratch), ["bash-env.sh"]);
});

test("OS lock refuses an empty HOME before entering the namespace", () => {
  const result = spawnSync("bash", [lock, "true"], {
    encoding: "utf8",
    env: { ...process.env, HOME: "" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HOME must be a non-empty absolute path/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /OS lock active/);
});
