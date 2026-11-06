// First drafts of the rules, bundled with the code. The database copy is the live one:
// a default is only inserted when that rule doesn't exist yet, so edits made in the hub always win.

import bookDetails from "../rules/book-details.md";
import buyDecision from "../rules/buy-decision.md";
import checkin from "../rules/checkin.md";
import connectorGuide from "../rules/connector-guide.md";
import discussion from "../rules/discussion.md";
import fictionTaste from "../rules/fiction-taste.md";
import honesty from "../rules/honesty.md";
import mostFeatured from "../rules/most-featured.md";
import outputFormat from "../rules/output-format.md";
import ranking from "../rules/ranking.md";
import recommendations from "../rules/recommendations.md";
import researchReuse from "../rules/research-reuse.md";
import shelf from "../rules/shelf.md";
import store from "../rules/store.md";
import summary from "../rules/summary.md";
import tags from "../rules/tags.md";
import nonfictionTaste from "../rules/nonfiction-taste.md";
import timelessNonfiction from "../rules/timeless-nonfiction.md";
import trustedReaders from "../rules/trusted-readers.md";

export const DEFAULT_RULES: Record<string, string> = {
	"book-details": bookDetails,
	"buy-decision": buyDecision,
	"checkin": checkin,
	"connector-guide": connectorGuide,
	"discussion": discussion,
	"fiction-taste": fictionTaste,
	"honesty": honesty,
	"most-featured": mostFeatured,
	"nonfiction-taste": nonfictionTaste,
	"output-format": outputFormat,
	"ranking": ranking,
	"recommendations": recommendations,
	"research-reuse": researchReuse,
	"shelf": shelf,
	"store": store,
	"summary": summary,
	"tags": tags,
	"timeless-nonfiction": timelessNonfiction,
	"trusted-readers": trustedReaders,
};

/** Title = the first "# " heading of the file. */
export function ruleTitle(body: string, fallback: string) {
	return body.match(/^#\s+(.+)$/m)?.[1].trim() ?? fallback;
}

export async function ensureDefaultRules(db: D1Database) {
	const { results } = await db.prepare("SELECT name FROM rules").all<{ name: string }>();
	const have = new Set(results.map((r) => r.name));
	const missing = Object.entries(DEFAULT_RULES).filter(([name]) => !have.has(name));
	if (missing.length === 0) return;
	await db.batch(missing.map(([name, body]) => db.prepare("INSERT OR IGNORE INTO rules (name, title, body) VALUES (?, ?, ?)").bind(name, ruleTitle(body, name), body)));
}
