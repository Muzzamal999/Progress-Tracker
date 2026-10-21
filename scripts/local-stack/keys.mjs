import { createHmac } from "node:crypto";
const secret = "local-test-jwt-secret-at-least-32-characters-long!!";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => { const h = b64({ alg: "HS256", typ: "JWT" }); const p = b64(payload); return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`; };
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
console.log(JSON.stringify({ secret, anon: sign({ role: "anon", iss: "supabase", exp }), service: sign({ role: "service_role", iss: "supabase", exp }) }));
