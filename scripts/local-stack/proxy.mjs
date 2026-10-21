// Minimal stand-in for the Supabase API gateway: /rest/v1 -> PostgREST, /auth/v1 -> GoTrue.
import http from "node:http";
const routes = [["/rest/v1", 3010], ["/auth/v1", 9998]];
http.createServer((req, res) => {
  if (req.method === "OPTIONS") { // the real gateway answers CORS preflights itself
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin ?? "*", "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*", "access-control-max-age": "600",
    });
    return res.end();
  }
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (!r) { res.writeHead(404); return res.end("not found"); }
  const headers = { ...req.headers, host: `127.0.0.1:${r[1]}` };
  const up = http.request({ host: "127.0.0.1", port: r[1], path: req.url.slice(r[0].length) || "/", method: req.method, headers }, (u) => {
    res.writeHead(u.statusCode, { ...u.headers, "access-control-allow-origin": req.headers.origin ?? "*", "access-control-allow-credentials": "true" });
    u.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(54321, "127.0.0.1", () => console.log("proxy on 54321"));
