// Packet-free check that this process is in a loopback-only network namespace.
// /proc/net/dev follows the namespace. sysfs does not, so it is not consulted.
import { readFileSync } from "node:fs";
import net from "node:net";

export function netdevIfaces() {
  const lines = readFileSync("/proc/net/dev", "utf8").split("\n").slice(2);
  const names = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    names.push(trimmed.split(":")[0]);
  }
  return names;
}

function loopbackAccepts() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

let announced = false;

export function projectNamesFromArgv(argv = process.argv) {
  const selected = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" || arg === "-p") {
      if (argv[i + 1]) selected.push(argv[++i]);
    } else if (arg.startsWith("--project=")) {
      selected.push(arg.slice("--project=".length));
    }
  }
  return selected;
}

// globalSetup sees every project in the config, including ones this invocation
// will not run. Direct `npx playwright test --project iphone-webkit` must still
// fail closed, and a chromium-only run must not.
export function webkitWillRun(config, argv = process.argv) {
  const projects = (config && config.projects) || [];
  const webkit = new Set(
    projects.filter((project) => project.use && project.use.browserName === "webkit").map((project) => project.name)
  );
  if (!webkit.size) return false;
  const selected = projectNamesFromArgv(argv);
  if (!selected.length) return true;
  return selected.some((name) => webkit.has(name));
}

export async function assertLoopbackOnly() {
  const names = netdevIfaces();
  if (names.length !== 1 || names[0] !== "lo") {
    throw new Error(
      `Refusing to run WebKit: network interfaces are ${names.join(", ") || "(none)"}. ` +
      "route() is not enough on WebKit. Run: bash logger/tests/e2e/with-os-lock.sh npm run pw:smoke"
    );
  }
  if (!(await loopbackAccepts())) {
    throw new Error("Refusing to run WebKit: loopback is not accepting connections. The OS lock did not come up.");
  }
  if (!announced) {
    console.log("OS lock active: only loopback is present");
    announced = true;
  }
}
