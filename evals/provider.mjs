// promptfoo provider: runs one request through Claude Code (Pro plan) with the Book Hub skills and the
// LOCAL test connector, then returns Claude's answer plus what it saved in the local database.
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

const SYSTEM = `This is an automated test of Book Hub. Complete the request fully in one reply without asking the user anything:
if a choice is needed, pick the most common reading and say so. Use the Book Hub connector (server "bookhub") exactly as the rules say, including saving.`;

function localQuery(sql) {
	const out = execFileSync("npx", ["wrangler", "d1", "execute", "book-hub", "--local", "--json", "--command", sql], { cwd: repo, encoding: "utf8" });
	return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

export default class ClaudeCodeProvider {
	id() {
		return "claude-code-book-hub";
	}
	async callApi(prompt) {
		const before = localQuery("SELECT COALESCE(MAX(id), 0) AS id FROM requests")[0].id;
		const run = spawnSync(
			"claude",
			["-p", prompt, "--mcp-config", join(here, "mcp-dev.json"), "--strict-mcp-config", "--append-system-prompt", SYSTEM,
				"--allowedTools", "mcp__bookhub__*", "WebSearch", "WebFetch", "Skill", "--output-format", "text"],
			{ cwd: here, encoding: "utf8", timeout: 15 * 60_000, maxBuffer: 50 * 1024 * 1024 },
		);
		if (run.status !== 0) return { error: `claude exited ${run.status}: ${(run.stderr || "").slice(0, 2000)}` };
		const requests = localQuery(`SELECT id, feature, input FROM requests WHERE id > ${before}`);
		const ids = requests.map((r) => r.id).join(",") || "0";
		const appearances = localQuery(
			`SELECT a.request_id, a.rank, a.origin, s.title, json_extract(c.card, '$.timeless') AS timeless, json_extract(c.card, '$.buy') AS buy
			 FROM appearances a JOIN sources s ON s.id = a.source_id LEFT JOIN cards c ON c.source_id = s.id WHERE a.request_id IN (${ids}) ORDER BY a.request_id, a.rank`,
		);
		const cards = localQuery("SELECT s.title, json_extract(c.card, '$.timeless') AS timeless, json_extract(c.card, '$.buy') AS buy FROM cards c JOIN sources s ON s.id = c.source_id");
		const books = localQuery("SELECT title, library_status AS status, one_liner, (SELECT COUNT(*) FROM source_tags t WHERE t.source_id = s.id) AS tags FROM sources s");
		return { output: JSON.stringify({ text: run.stdout, requests, appearances, cards, books }) };
	}
}
