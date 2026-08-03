/*
 * A static file server in the standard library, for the docs page and for
 * Playwright's webServer. No dependency, because a design system that needs a
 * package installed before anyone can look at it has a barrier where it should
 * have a front door.
 *
 *     node tools/serve.js [port]
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8141);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";

  /* Refuse to serve outside ROOT. normalize() collapses ".." before the join,
     so a path that escapes is rejected rather than silently resolved. */
  rel = normalize(rel);
  if (rel.startsWith("..") || rel.includes("\0")) {
    res.writeHead(403).end();
    return;
  }

  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}).listen(PORT, () => {
  console.log(`serving ${ROOT} on http://localhost:${PORT}/`);
});
