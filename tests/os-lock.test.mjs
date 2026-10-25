import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = join(root, "logger/tests/e2e/with-os-lock.sh");

// Quotes, a newline, and a command substitution must survive sudo-rs, which
// ignores a bare --preserve-env and would otherwise reset HOME to /root.
const sentinel = "a b'c\"d\n$(echo pwned)";

test("OS lock restores the caller environment and stays on loopback", () => {
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
    "    'sentinel': os.environ.get('INSIGHT_LOCK_PROBE'),",
    "    'netns': os.environ.get('INSIGHT_NETNS'),",
    "    'lock_home': os.environ.get('INSIGHT_LOCK_HOME', ''),",
    "    'uid': os.getuid(),",
    "    'external': external,",
    "    'path': os.environ.get('PATH', ''),",
    "}))",
  ].join("\n");
  const result = spawnSync("bash", [lock, "python3", "-c", probe], {
    encoding: "utf8",
    env: { ...process.env, INSIGHT_LOCK_PROBE: sentinel },
  });
  assert.equal(result.status, 0, `status ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /OS lock active: only loopback is present/);
  assert.doesNotMatch(result.stderr, /preserve-env is ignored/);
  const line = result.stdout.trim().split("\n").pop();
  const got = JSON.parse(line);
  assert.equal(got.home, process.env.HOME);
  assert.equal(got.sentinel, sentinel);
  assert.equal(got.netns, "1");
  assert.equal(got.lock_home, "");
  assert.equal(got.uid, process.getuid());
  assert.notEqual(got.uid, 0);
  assert.match(got.external, /^closed:/);
  // secure_path would drop the Node install directory. npm lives there.
  const nodeDir = dirname(process.execPath);
  assert.ok(got.path.split(delimiter).includes(nodeDir), `PATH lost ${nodeDir}: ${got.path}`);
});
