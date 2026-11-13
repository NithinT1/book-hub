// Push edited default rules (rules/*.md) to the live database as new versions.
// Usage: node scripts/push-rules.mjs <rule-name> [...] | --all   [--force]
// A live rule counts as "edited in the hub" if it matches no version of its file in git history; those are skipped
// unless --force, because the hub copy is the live one and holds the user's own edits.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const force = args.includes("--force");
// Personal rules: every hub keeps its own (the files are only neutral starters). Never pushed — not even with
// --all or --force — so a starter can't overwrite someone's profile or their own way of judging books.
// Edit them in the hub (Profile & settings).
const PERSONAL = new Set(["fiction-profile", "nonfiction-profile", "trusted-readers", "buying-preferences", "quality-nonfiction", "quality-fiction", "fit", "verdict", "tags"]);
import { readdirSync } from "node:fs";
const names = args.includes("--all")
	? readdirSync(new URL("../rules/", import.meta.url)).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3))
	: args.filter((a) => !a.startsWith("--"));
if (!names.length) throw new Error("List the rule names to push, or --all.");

/** Every committed version of a rule file, to tell our own past pushes from the user's hub edits. */
function committedVersions(name) {
	const path = `rules/${name}.md`;
	const hashes = execFileSync("git", ["log", "--format=%H", "--", path], { encoding: "utf8" }).split("\n").filter(Boolean);
	return hashes.map((h) => {
		try {
			return execFileSync("git", ["show", `${h}:${path}`], { encoding: "utf8" });
		} catch {
			return null;
		}
	});
}

const CONFIG = ["--config", existsSync("wrangler.local.jsonc") ? "wrangler.local.jsonc" : "wrangler.jsonc"];
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const wr = (cmd) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "book-hub", "--remote", "--json", ...CONFIG, ...cmd], { encoding: "utf8" }))[0].results;

const live = wr(["--command", `SELECT name, version, body FROM rules WHERE name IN (${names.map(q).join(",")})`]);
const sql = [];
for (const name of names) {
	if (PERSONAL.has(name)) {
		console.log(`${name}: personal — never pushed (edit it in the hub)`);
		continue;
	}
	const body = readFileSync(new URL(`../rules/${name}.md`, import.meta.url), "utf8");
	const title = body.match(/^#\s+(.+)$/m)?.[1].trim() ?? name;
	const row = live.find((r) => r.name === name);
	if (!row) {
		sql.push(`INSERT INTO rules (name, title, body) VALUES (${q(name)}, ${q(title)}, ${q(body)});`);
		console.log(`${name}: new`);
	} else if (row.body === body) {
		console.log(`${name}: unchanged`);
	} else if (!committedVersions(name).includes(row.body) && !force) {
		console.log(`${name}: SKIPPED — edited in the hub (v${row.version}). Merge by hand or pass --force.`);
	} else {
		sql.push(`INSERT OR IGNORE INTO rules_history (name, version, body) SELECT name, version, body FROM rules WHERE name = ${q(name)};`);
		sql.push(`UPDATE rules SET title = ${q(title)}, body = ${q(body)}, version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE name = ${q(name)};`);
		console.log(`${name}: v${row.version} → v${row.version + 1}`);
	}
}
if (sql.length) {
	const file = join(tmpdir(), `push-rules-${Date.now()}.sql`);
	writeFileSync(file, sql.join("\n"));
	execFileSync("npx", ["wrangler", "d1", "execute", "book-hub", "--remote", "--yes", ...CONFIG, "--file", file], { stdio: "inherit" });
	console.log("Pushed.");
}
