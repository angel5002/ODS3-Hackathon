// Recupera el código fuente de un despliegue de Vercel hecho con la CLI (`vercel deploy`).
// No escribe en este repositorio: guarda todo en una carpeta hermana nueva.
//
// Uso (PowerShell, desde la raíz del repositorio):
//   $env:VERCEL_TOKEN = "<token temporal>"
//   node scripts/recuperar-desde-vercel.mjs                      # lista los últimos despliegues y usa el más reciente
//   node scripts/recuperar-desde-vercel.mjs <id-o-url-del-despliegue>
//
// Requisitos: Node 18 o superior y el archivo .vercel/project.json del proyecto.
// Por seguridad, no guarda archivos .env* ni carpetas node_modules o .next.

import fs from "node:fs";
import path from "node:path";

const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Falta la variable VERCEL_TOKEN. Crea un token temporal en https://vercel.com/account/settings/tokens");
  process.exit(1);
}

let proj;
try {
  proj = JSON.parse(fs.readFileSync(".vercel/project.json", "utf8"));
} catch {
  console.error("No encontré .vercel/project.json. Ejecuta el script desde la raíz del repositorio enlazado con Vercel.");
  process.exit(1);
}
const teamId = proj.orgId && proj.orgId.startsWith("team_") ? proj.orgId : undefined;

async function api(p) {
  const sep = p.includes("?") ? "&" : "?";
  const url = `https://api.vercel.com${p}${teamId ? `${sep}teamId=${teamId}` : ""}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Vercel respondió ${r.status} en ${p}: ${(await r.text()).slice(0, 300)}`);
  return r;
}

// 1. Elegir el despliegue
let id = process.argv[2];
if (!id) {
  const r = await api(`/v6/deployments?projectId=${proj.projectId}&limit=5`);
  const { deployments = [] } = await r.json();
  if (!deployments.length) throw new Error("El proyecto no tiene despliegues.");
  console.log("Últimos despliegues:");
  for (const d of deployments) {
    console.log(`  ${d.uid}  ${new Date(d.created).toLocaleString("es-PE")}  ${d.target || "preview"}  ${d.state}  https://${d.url}`);
  }
  id = deployments[0].uid;
  console.log(`\nUsaré el más reciente: ${id}. Para otro, pásalo como argumento.\n`);
} else if (id.includes(".")) {
  const r = await api(`/v13/deployments/${encodeURIComponent(id.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))}`);
  id = (await r.json()).id;
}

// 2. Leer el árbol de archivos fuente
const tree = await (await api(`/v6/deployments/${id}/files`)).json();
const files = [];
const skipped = [];
const SKIP_DIR = new Set(["node_modules", ".next", ".git", ".vercel"]);
(function walk(nodes, prefix) {
  for (const n of nodes || []) {
    const rel = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === "directory") {
      if (SKIP_DIR.has(n.name)) { skipped.push(`${rel}/`); continue; }
      walk(n.children, rel);
    } else if (n.type === "file") {
      if (/^\.env/.test(n.name)) { skipped.push(rel); continue; }
      files.push({ rel, uid: n.uid });
    }
  }
})(tree, "");

if (!files.length) {
  console.error("El despliegue no tiene árbol de código fuente. Ocurre cuando se desplegó desde Git o con --prebuilt.");
  process.exit(1);
}

// 3. Descargar a una carpeta hermana nueva
const dest = path.resolve("..", `${path.basename(process.cwd())}-desde-vercel-${id.slice(-8)}`);
if (fs.existsSync(dest) && fs.readdirSync(dest).length) {
  console.error(`La carpeta ${dest} ya existe y no está vacía. Bórrala o muévela antes de volver a ejecutar.`);
  process.exit(1);
}

let done = 0;
async function download({ rel, uid }) {
  const r = await api(`/v8/deployments/${id}/files/${uid}`);
  const ct = r.headers.get("content-type") || "";
  let buf;
  if (ct.includes("application/json")) {
    const j = await r.json();
    const b64 = j.data ?? j.content ?? j.base64;
    if (typeof b64 !== "string") throw new Error(`Formato inesperado para ${rel}`);
    buf = Buffer.from(b64, "base64");
  } else {
    buf = Buffer.from(await r.arrayBuffer());
  }
  const out = path.join(dest, ...rel.split("/"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  done++;
  if (done % 25 === 0) console.log(`  ${done}/${files.length} archivos`);
}

const queue = [...files];
const failures = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const f = queue.shift();
    try { await download(f); } catch (e) { failures.push(`${f.rel}: ${e.message}`); }
  }
}));

console.log(`\nListo: ${done} archivos en ${dest}`);
if (skipped.length) console.log(`Omitidos por seguridad o por ser generados: ${skipped.join(", ")}`);
if (failures.length) {
  console.log(`\nNo se pudieron descargar ${failures.length} archivos:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
console.log("\nRecuerda borrar el token en https://vercel.com/account/settings/tokens cuando termines.");
