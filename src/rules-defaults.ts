// First drafts of the rules, bundled with the code. The database copy is the live one:
// a default is only inserted when that rule doesn't exist yet, so edits made in the hub always win.

import bookDetails from "../rules/book-details.md";
import buyingPreferences from "../rules/buying-preferences.md";
import checkin from "../rules/checkin.md";
import connectorGuide from "../rules/connector-guide.md";
import discussion from "../rules/discussion.md";
import fictionProfile from "../rules/fiction-profile.md";
import fit from "../rules/fit.md";
import handover from "../rules/handover.md";
import honesty from "../rules/honesty.md";
import mostFeatured from "../rules/most-featured.md";
import nonfictionProfile from "../rules/nonfiction-profile.md";
import outputFormat from "../rules/output-format.md";
import qualityFiction from "../rules/quality-fiction.md";
import qualityNonfiction from "../rules/quality-nonfiction.md";
import quiz from "../rules/quiz.md";
import ranking from "../rules/ranking.md";
import recommendations from "../rules/recommendations.md";
import researchReuse from "../rules/research-reuse.md";
import shelf from "../rules/shelf.md";
import store from "../rules/store.md";
import summary from "../rules/summary.md";
import tags from "../rules/tags.md";
import trustedReaders from "../rules/trusted-readers.md";
import verdict from "../rules/verdict.md";

export const DEFAULT_RULES: Record<string, string> = {
	"book-details": bookDetails,
	"buying-preferences": buyingPreferences,
	"checkin": checkin,
	"connector-guide": connectorGuide,
	"discussion": discussion,
	"fiction-profile": fictionProfile,
	"fit": fit,
	"handover": handover,
	"honesty": honesty,
	"most-featured": mostFeatured,
	"nonfiction-profile": nonfictionProfile,
	"output-format": outputFormat,
	"quality-fiction": qualityFiction,
	"quality-nonfiction": qualityNonfiction,
	"quiz": quiz,
	"ranking": ranking,
	"recommendations": recommendations,
	"research-reuse": researchReuse,
	"shelf": shelf,
	"store": store,
	"summary": summary,
	"tags": tags,
	"trusted-readers": trustedReaders,
	"verdict": verdict,
};

// ---- How the rules are organised in the hub ------------------------------------------------------------------

export type RuleGroup = "me" | "judge" | "system";
export type RuleInfo = { group: RuleGroup; label: string; what: string; usedIn: string };

export const RULE_GROUPS: Record<RuleGroup, { title: string; intro: string }> = {
	me: { title: "About me as a reader", intro: "What makes a book right for you. Used for Fit." },
	judge: { title: "How I judge books", intro: "Works well without changes. Customise it if you have your own method." },
	system: { title: "System rules", intro: "How your AI works with the hub: honesty, formats, ranking and the steps of each command. Change only if you know why." },
};

/** Every bundled rule: where it sits in the hub, what it does in plain words, and where it's used. */
export const RULE_INFO: Record<string, RuleInfo> = {
	"nonfiction-profile": { group: "me", label: "Non-fiction profile", what: "Why you read, your subjects, what you're working on, your values and reading time.", usedIn: "Fit on every card · Verdict (reading time) · Recommendations · Book details · Check-in · Bookstore" },
	"fiction-profile": { group: "me", label: "Fiction profile", what: "What you want fiction to do and what to avoid.", usedIn: "Fit on fiction · Recommendations · Book details · Check-in" },
	"trusted-readers": { group: "me", label: "People I trust", what: "Readers whose picks count as endorsements. They're checked first and always linked.", usedIn: "Endorsements on every card" },
	"buying-preferences": { group: "me", label: "Buying preferences", what: "How you like to get books: physical, Kindle, second-hand.", usedIn: "How to get it, on Read verdicts · Bookstore" },
	"quality-nonfiction": { group: "judge", label: "Quality: non-fiction", what: "Is this a good book? Gates, factors and weights, and the Timeless test.", usedIn: "Quality and Timeless on every card · ranking ties · what is never recommended" },
	"quality-fiction": { group: "judge", label: "Quality: fiction", what: "Craft, pull, depth, originality and classic status.", usedIn: "Quality and Timeless on fiction cards" },
	"fit": { group: "judge", label: "Fit scale", what: "Is this book right for you? What 0 to 10 means, and the General and Self labels.", usedIn: "Fit on every card · check-in order" },
	"verdict": { group: "judge", label: "Verdict", what: "What to do with a book: Read, Read parts, Reread, Idea only, Bench or Skip, and how to get it.", usedIn: "Every card · book page · Buy list notes · Bookstore · Give-away · Check-in" },
	"honesty": { group: "system", label: "Honesty", what: "Every rating, price and endorsement has a link and a date, or says \"couldn't fetch\".", usedIn: "Everything" },
	"ranking": { group: "system", label: "Ranking", what: "Orders lists: answers the question first, then Quality. Your library never changes the order.", usedIn: "Recommendations · Book details" },
	"handover": { group: "system", label: "Hand-over", what: "When to move to another step automatically, and when to ask first.", usedIn: "All commands" },
	"output-format": { group: "system", label: "Card format", what: "What a book card shows, and in what order.", usedIn: "All cards" },
	"research-reuse": { group: "system", label: "Reusing research", what: "How long saved facts, scores and verdicts stay fresh.", usedIn: "All research" },
	"most-featured": { group: "system", label: "Most featured", what: "When a book earns the ★.", usedIn: "Discover · Home" },
	"tags": { group: "system", label: "Tags", what: "The tag list for saved books.", usedIn: "Saving books" },
	"connector-guide": { group: "system", label: "Connector guide", what: "How books are identified, saved and linked.", usedIn: "Saving books" },
	"recommendations": { group: "system", label: "Flow: recommendations", what: "The steps of /book-recs.", usedIn: "/book-recs" },
	"book-details": { group: "system", label: "Flow: book details", what: "The steps of /book-details.", usedIn: "/book-details" },
	"store": { group: "system", label: "Flow: bookstore", what: "The steps of /book-store.", usedIn: "/book-store" },
	"shelf": { group: "system", label: "Flow: my shelf", what: "The steps of /book-shelf: catalogue and give-away.", usedIn: "/book-shelf" },
	"checkin": { group: "system", label: "Flow: check-in", what: "The steps of /book-checkin.", usedIn: "/book-checkin" },
	"summary": { group: "system", label: "Flow: long summary", what: "The steps of /book-summary.", usedIn: "/book-summary" },
	"discussion": { group: "system", label: "Flow: discussion", what: "The steps of /book-discuss.", usedIn: "/book-discuss" },
	"quiz": { group: "system", label: "Flow: book quiz", what: "The steps of /book-quiz: questions, grading, the \"You already know\" score and what it decides.", usedIn: "/book-quiz" },
};

/** Info for any rule; rules the reader added themselves sit with "About me" and are used everywhere. */
export function ruleInfo(name: string, title?: string): RuleInfo {
	return RULE_INFO[name] ?? { group: "me", label: title ?? name, what: "A rule you added. It's read on every command.", usedIn: "All commands" };
}

/** True when the rule is still the bundled starter text. */
export function isStarter(name: string, body: string) {
	const d = DEFAULT_RULES[name];
	return d !== undefined && d.trim() === body.trim();
}

// ---- Which rules each command reads -------------------------------------------------------------------------
// Skills ask for a flow; the hub decides the list. Adding or renaming rules then never needs a skill re-upload.

const JUDGING = ["quality-nonfiction", "quality-fiction", "fit", "verdict", "nonfiction-profile", "fiction-profile", "buying-preferences"];
const COMMON = ["honesty", "handover", "connector-guide", "tags", "research-reuse"];

export const FLOWS = {
	recs: ["recommendations", "book-details", "output-format", "ranking", "trusted-readers", ...JUDGING, ...COMMON],
	details: ["book-details", "recommendations", "output-format", "ranking", "trusted-readers", ...JUDGING, ...COMMON],
	store: ["store", "output-format", "trusted-readers", ...JUDGING, ...COMMON],
	shelf: ["shelf", "verdict", "quality-nonfiction", "buying-preferences", ...COMMON],
	checkin: ["checkin", "output-format", "ranking", ...JUDGING, ...COMMON],
	summary: ["summary", "honesty", "nonfiction-profile", "fiction-profile", "handover", "connector-guide"],
	discuss: ["discussion", "honesty", "handover"],
	quiz: ["quiz", "verdict", "fit", "nonfiction-profile", "quality-nonfiction", "honesty", "handover", "connector-guide"],
} as const;
export type Flow = keyof typeof FLOWS;
export const FLOW_NAMES = Object.keys(FLOWS) as Flow[];

/** The rule names for a flow, plus any rules the reader added themselves (those apply everywhere). */
export function rulesForFlow(flow: Flow, existing: string[]) {
	const own = existing.filter((n) => !(n in RULE_INFO));
	return [...new Set([...FLOWS[flow], ...own])];
}

// ---- Seeding -------------------------------------------------------------------------------------------------

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
