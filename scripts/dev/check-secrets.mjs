// Pre-push secret check. Run before every push: node scripts/dev/check-secrets.mjs
//
// 1. Reads .env.local and .env.local.anterior inside this process and takes every value of 12 characters or
//    more, except the variables in PUBLIC_BY_DESIGN (exact names, no wildcards). Looks for each value in
//    `git log -p --all` and in every file listed by `git ls-files`.
// 2. Looks for well-known secret prefixes (built from fragments so this file never matches itself).
//
// It only prints VARIABLE_NAME: count, plus the commits and files where it appears.
// It never prints, logs or stores a value (not even partly or masked), never passes values on the
// command line and never writes files. Exit code 1 when anything is found.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { parse } from "dotenv";

const MIN_LEN = 12;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const ENV_FILES = [".env.local", ".env.local.anterior"];
// Values that are public by design (model name, public URL, Supabase project URL and ref). Exact names only.
const PUBLIC_BY_DESIGN = new Set(["ANTHROPIC_MODEL", "PUBLIC_BASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_PROJECT_REF"]);

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    console.error(`git ${args[0]} falló`);
    process.exit(2);
  }
}

function count(haystack, needle) {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

// History split by commit, so a hit can be located without showing it.
const log = git(["log", "-p", "--all", "--no-color", "--no-ext-diff"]);
const commits = [];
for (const chunk of log.split(/^(?=commit [0-9a-f]{40})/m)) {
  const m = chunk.match(/^commit ([0-9a-f]{40})/);
  if (m) commits.push({ id: m[1].slice(0, 7), text: chunk });
}

const files = [];
for (const path of git(["ls-files", "-z"]).split("\0").filter(Boolean)) {
  if (!existsSync(path)) continue;
  const st = statSync(path);
  if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
  files.push({ path, text: readFileSync(path).toString("latin1") });
}

function tally(countIn) {
  const where = { total: 0, commits: [], files: [] };
  for (const c of commits) {
    const n = countIn(c.text);
    if (n) {
      where.total += n;
      where.commits.push(c.id);
    }
  }
  for (const f of files) {
    const n = countIn(f.text);
    if (n) {
      where.total += n;
      where.files.push(f.path);
    }
  }
  return where;
}
const scan = (needle) => tally((text) => count(text, needle));
const scanRe = (re) => tally((text) => (text.match(re) ?? []).length);

function report(label, where) {
  let line = `${label}: ${where.total}`;
  if (where.total) {
    const parts = [];
    if (where.commits.length) parts.push(`commits ${where.commits.join(", ")}`);
    if (where.files.length) parts.push(`archivos ${where.files.join(", ")}`);
    line += ` (${parts.join("; ")})`;
  }
  console.log(line);
  return where.total;
}

let found = 0;

for (const file of ENV_FILES) {
  console.log(`== Valores de ${file} (12 caracteres o más)`);
  if (!existsSync(file)) {
    console.log(`No hay ${file}: se omite.`);
    continue;
  }
  const env = parse(readFileSync(file));
  const names = Object.keys(env)
    .filter((k) => (env[k] ?? "").trim().length >= MIN_LEN)
    .sort();
  if (!names.length) console.log("Ningún valor de 12 caracteres o más.");
  for (const name of names) {
    if (PUBLIC_BY_DESIGN.has(name)) {
      console.log(`${name}: se ignora (público por diseño)`);
      continue;
    }
    found += report(name, scan(env[name].trim()));
  }
}

console.log("== Prefijos conocidos");
const PREFIXES = [
  ["sk-" + "ant-", "Anthropic"],
  ["eyJ" + "hbGci", "JWT"],
  ["-".repeat(5) + "BEGIN", "clave privada"],
  ["vercel" + "_", "Vercel"],
];
for (const [needle, label] of PREFIXES) found += report(label, scan(needle));
// a Supabase secret key is the prefix followed by its value: a bare mention of the format does not count
found += report("Supabase secret (prefijo + 20 caracteres)", scanRe(new RegExp("sb_" + "secret_[A-Za-z0-9_-]{20,}", "g")));
found += report("sk_ + 20 caracteres", scanRe(new RegExp("sk" + "_[A-Za-z0-9]{20}", "g")));

console.log(found ? "\nRESULTADO: hay coincidencias. No hagas push." : "\nRESULTADO: 0 coincidencias.");
process.exit(found ? 1 : 0);
