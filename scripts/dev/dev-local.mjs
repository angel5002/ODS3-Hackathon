// Local dev server with a local-only test PIN (the real DEMO_PIN is never used in tests).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../..", import.meta.url)));
const env = { ...process.env, DEMO_PIN: process.env.LOCAL_TEST_PIN ?? "246810" };
const mode = process.argv[2] === "start" ? ["start", "-p", "3000"] : ["dev", "-p", "3000"];
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...mode], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
