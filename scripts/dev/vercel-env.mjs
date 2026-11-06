// Copies server variables from .env.local to the Vercel project (Production + Preview) without printing
// their values. Run it yourself; it needs VERCEL_TOKEN in .env.local.
// Usage: node scripts/dev/vercel-env.mjs ANTHROPIC_API_KEY ANTHROPIC_MODEL ELEVENLABS_API_KEY ...
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const PROJECT = "prj_nWpsBGNxQuIh1ZVQXyGUFE6CzLQ1";
const TEAM = "team_JpdkJ5IfWbnjb3KMpsj6ATQl";
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error("Falta VERCEL_TOKEN en .env.local");
const api = (path, init = {}) =>
  fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  }).then((r) => r.json());
const { envs = [] } = await api(`/v10/projects/${PROJECT}/env`);
for (const key of process.argv.slice(2)) {
  const value = process.env[key];
  if (!value) {
    console.log(key, "vacía en .env.local: no se carga");
    continue;
  }
  const existing = envs.find((e) => e.key === key);
  const res = existing
    ? await api(`/v9/projects/${PROJECT}/env/${existing.id}`, { method: "PATCH", body: JSON.stringify({ value, target: ["production", "preview"] }) })
    : await api(`/v10/projects/${PROJECT}/env`, { method: "POST", body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview"] }) });
  console.log(key, res.error ? `error: ${res.error.message}` : existing ? "actualizada" : "creada");
}
