import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.env.PORT || 4173);
const html = await readFile(new URL("./index.html", import.meta.url));

createServer((request, response) => {
  if (request.method !== "GET" || !["/", "/index.html"].includes(new URL(request.url, "http://localhost").pathname)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log(`Playroom test build: http://127.0.0.1:${port}`);
});