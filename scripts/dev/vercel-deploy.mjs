// Production deploy through the Vercel REST API (the CLI rejects team tokens without a user).
// Uploads the git-tracked files (minus .vercelignore) and creates a production deployment.
// Usage: node scripts/dev/vercel-deploy.mjs
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const PROJECT = "prj_nWpsBGNxQuIh1ZVQXyGUFE6CzLQ1";
const TEAM = "team_JpdkJ5IfWbnjb3KMpsj6ATQl";
const token = process.env.VERCEL_TOKEN;
const q = `teamId=${TEAM}`;

const ignore = readFileSync(".vercelignore", "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const neg = ignore.filter((l) => l.startsWith("!")).map((l) => l.slice(1));
const toRe = (g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + (g.endsWith("/") ? "" : "($|/)"));
const pats = ignore.filter((l) => !l.startsWith("!")).map(toRe);
const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => neg.includes(f) || !pats.some((re) => re.test(f)));
if (files.some((f) => /\.env\.local|DATOS HOSPITAL|AsistIA_respaldo/.test(f))) throw new Error("archivo prohibido en la lista");

const list = [];
let bytes = 0;
for (const file of files) {
  const data = readFileSync(file);
  const sha = createHash("sha1").update(data).digest("hex");
  list.push({ file, sha, size: statSync(file).size });
  bytes += data.length;
  const r = await fetch(`https://api.vercel.com/v2/files?${q}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-vercel-digest": sha, "Content-Length": String(data.length), "Content-Type": "application/octet-stream" },
    body: data,
  });
  if (!r.ok) throw new Error(`subida ${file}: ${r.status} ${await r.text()}`);
}
console.log(`Archivos subidos: ${list.length} (${(bytes / 1e6).toFixed(1)} MB)`);

const res = await fetch(`https://api.vercel.com/v13/deployments?${q}&forceNew=1`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ name: "ods3-hackathon", project: PROJECT, target: "production", files: list, projectSettings: { framework: "nextjs" } }),
});
const d = await res.json();
if (!res.ok) throw new Error(JSON.stringify(d).slice(0, 500));
console.log("Despliegue:", d.id, d.url, d.readyState);
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await fetch(`https://api.vercel.com/v13/deployments/${d.id}?${q}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
  if (["READY", "ERROR", "CANCELED"].includes(s.readyState)) {
    console.log("Estado:", s.readyState, s.aliasAssigned ? "alias asignado" : "", (s.alias ?? []).join(", "));
    if (s.readyState !== "READY") process.exit(1);
    break;
  }
}
