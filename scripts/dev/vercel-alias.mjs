// Points a fixed alias (e.g. asistia-e5.vercel.app) at a PREVIEW deployment through the Vercel REST API,
// so the team keeps the same URL across redeploys. Refuses production aliases. Prints only ids, urls and status.
// Usage: node --env-file=<path>/.env.local scripts/dev/vercel-alias.mjs <deploymentIdOrUrl> <alias> [--unprotect]
//   --unprotect  also adds the alias to Deployment Protection Exceptions (alias-protection-override), so it opens
//                without a Vercel login. The exception belongs to the domain: it survives later redeploys to it.
//                Revoke: node scripts/dev/vercel-alias.mjs --reprotect <alias>
// Docs: https://vercel.com/docs/rest-api/aliases/assign-an-alias
//       https://vercel.com/docs/rest-api/aliases/update-the-protection-bypass-for-a-url
//       https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions
const TEAM = "team_JpdkJ5IfWbnjb3KMpsj6ATQl";
const PROD_ALIASES = ["ods3-hackathon.vercel.app"];
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error("Falta VERCEL_TOKEN (usa node --env-file=.env.local)");

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
};
const host = (s) => s.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const override = async (alias, action) => {
  const a = await api(`/v4/aliases/${encodeURIComponent(alias)}`);
  if (!a.ok) throw new Error(`alias ${alias} no encontrado: ${a.status}`);
  const r = await api(`/aliases/${a.body.uid}/protection-bypass`, {
    method: "PATCH",
    body: JSON.stringify({ override: { scope: "alias-protection-override", action } }),
  });
  console.log(`Excepción de protección (${action}) ${alias}:`, r.status, r.ok ? "ok" : r.body?.error?.message ?? "");
  if (!r.ok) process.exit(1);
};

if (flags.has("--reprotect")) {
  const alias = host(args[0] ?? "");
  if (!alias) throw new Error("Uso: vercel-alias.mjs --reprotect <alias>");
  await override(alias, "revoke");
  process.exit(0);
}

const [target, aliasArg] = args;
if (!target || !aliasArg) throw new Error("Uso: vercel-alias.mjs <deploymentIdOrUrl> <alias> [--unprotect]");
const alias = host(aliasArg);
if (PROD_ALIASES.includes(alias)) throw new Error("Ese es el alias de producción: no se toca");

const idOrUrl = target.startsWith("dpl_") ? target : host(target);
const d = await api(`/v13/deployments/${encodeURIComponent(idOrUrl)}`);
if (!d.ok) throw new Error(`despliegue no encontrado: ${d.status}`);
if (d.body.target === "production") throw new Error("Es un despliegue de producción: este script solo apunta alias a vistas previas");
if (d.body.readyState !== "READY") throw new Error(`el despliegue no está listo: ${d.body.readyState}`);
console.log("Despliegue:", d.body.id, d.body.url, d.body.readyState);

const r = await api(`/v2/deployments/${d.body.id}/aliases`, { method: "POST", body: JSON.stringify({ alias }) });
console.log("Alias:", r.status, r.ok ? `https://${r.body.alias} -> ${r.body.deploymentId ?? d.body.id}` : r.body?.error?.code ?? "", r.ok ? "" : r.body?.error?.message ?? "");
if (!r.ok) process.exit(1);
if (flags.has("--unprotect")) await override(alias, "create");
