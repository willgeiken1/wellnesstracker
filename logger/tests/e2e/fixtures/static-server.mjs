// Serves logger/ for Playwright. Listens on 127.0.0.1 and ::1 so the
// browser can open http://localhost (the service worker refuses 127.0.0.1).
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const port = Number(process.env.PW_PORT || process.env.INSIGHT_TEST_PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

function listen(host) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const rel = pathname.replace(/^\/+/, "");
      const file = normalize(join(root, rel));
      const rootPrefix = root.endsWith(sep) ? root : root + sep;
      if (file !== root && !file.startsWith(rootPrefix)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] || "application/octet-stream",
        "content-length": info.size,
        "cache-control": "no-store",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        reject(new Error(`Refusing to reuse port ${port} on ${host}: it is already in use. Unset INSIGHT_TEST_PORT to pick a free port.`));
        return;
      }
      reject(err);
    });
    server.listen(port, host, () => resolve(server));
  });
}

const hosts = ["127.0.0.1"];
await listen("127.0.0.1");
try {
  await listen("::1");
  hosts.push("::1");
} catch (e) {
  console.error("ipv6 listen skipped:", e && e.code ? e.code : e);
}
console.log(`pw static server :${port} on ${hosts.join(", ")}`);
