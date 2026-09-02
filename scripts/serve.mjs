import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("site");
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][\/\\])+/, "");
    let path = join(root, relative === "/" ? "index.html" : relative);
    if (!path.startsWith(root)) throw new Error("invalid path");
    const info = await stat(path);
    if (info.isDirectory()) path = join(path, "index.html");
    response.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, () => console.log(`repo-dashboard: http://localhost:${port}`));
