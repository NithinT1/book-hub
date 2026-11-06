// `npm run deploy`: publish the hub, then bring the database tables up to date.
// Uses wrangler.local.jsonc if present (your own resource ids, kept out of git), else wrangler.jsonc, where
// Cloudflare creates the database and storage automatically on the first deploy.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const config = existsSync("wrangler.local.jsonc") ? "wrangler.local.jsonc" : "wrangler.jsonc";
console.log(`Using ${config}`);
const run = (...args) => execFileSync("npx", ["wrangler", ...args, "--config", config], { stdio: "inherit", shell: process.platform === "win32" });
run("deploy");
run("d1", "migrations", "apply", "DB", "--remote");
