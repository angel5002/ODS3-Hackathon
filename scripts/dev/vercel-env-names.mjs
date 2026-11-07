// Read-only: compares the NAMES of the Vercel Production variables with the names in .env.local.
// Never prints, decrypts or stores a value. Usage: node scripts/dev/vercel-env-names.mjs
import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";
config({ path: ".env.local", quiet: true });

const PROJECT = "prj_nWpsBGNxQuIh1ZVQXyGUFE6CzLQ1";
const TEAM = "team_JpdkJ5IfWbnjb3KMpsj6ATQl";
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.log("Falta VERCEL_TOKEN en .env.local");
  process.exit(1);
}
const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT}/env?teamId=${TEAM}`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) {
  console.log("Vercel respondió", res.status);
  process.exit(1);
}
const { envs = [] } = await res.json();
const prod = new Set(envs.filter((e) => (e.target ?? []).includes("production")).map((e) => e.key));
const local = parse(readFileSync(".env.local"));
const localSet = new Set(Object.keys(local));
const localFilled = new Set(Object.keys(local).filter((k) => (local[k] ?? "").trim() !== ""));

const all = [...new Set([...prod, ...localSet])].sort();
console.log("variable | Vercel Production | .env.local");
for (const k of all) {
  const v = prod.has(k) ? "sí" : "NO";
  const l = !localSet.has(k) ? "NO" : localFilled.has(k) ? "sí" : "vacía";
  console.log(`${k} | ${v} | ${l}`);
}
const updated = envs
  .filter((e) => (e.target ?? []).includes("production"))
  .map((e) => [e.key, e.updatedAt ?? e.createdAt])
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([k, t]) => `${k} ${new Date(t).toISOString()}`);
console.log("últimas actualizadas en Production:", updated.join("; "));
