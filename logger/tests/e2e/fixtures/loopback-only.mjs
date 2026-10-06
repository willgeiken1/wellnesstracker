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
  console.log("OS lock active: only loopback is present");
}
