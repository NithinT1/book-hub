// "About me as a reader": forms over the profile rules. The hub (not the AI) writes them; every save keeps the old
// version. Each field is one "## Heading" section of its rule, so the rule stays readable Markdown for the AI.

export type ProfileField = { heading: string; label: string; placeholder: string; rows: number; hint?: string };
export type ProfileRule = { rule: string; fields: ProfileField[] };

/** Rules edited as plain text boxes, one per section. */
export const SIMPLE_FORMS: Record<string, ProfileRule> = {
	"fiction-profile": {
		rule: "fiction-profile",
		fields: [
			{ heading: "What I want fiction to do", label: "What I want fiction to do", placeholder: "e.g. Clever mysteries. Big fantasy worlds. Stories set in other countries.", rows: 4 },
			{ heading: "Books or authors I loved", label: "Books or authors I loved", placeholder: "e.g. The Hobbit, Agatha Christie, Jane Austen", rows: 2 },
			{ heading: "Avoid", label: "Avoid", placeholder: "e.g. Graphic violence. Very long series.", rows: 3 },
			{ heading: "Other preferences", label: "Length and other preferences", placeholder: "e.g. Under 400 pages. Standalone books over series.", rows: 3 },
		],
	},
	"buying-preferences": {
		rule: "buying-preferences",
		fields: [{ heading: "My preferences", label: "How I like to get books", placeholder: "e.g. Physical books. Second-hand is fine. Kindle for hard language.", rows: 3 }],
	},
	"trusted-readers": {
		rule: "trusted-readers",
		fields: [{ heading: "People whose picks I trust", label: "People whose book picks I trust", placeholder: "e.g. A friend, a podcast host, a newspaper's book section", rows: 2, hint: "Separate names with · or new lines." }],
	},
};

// ---- Sections ------------------------------------------------------------------------------------------------

const NOT_SET = /^-?\s*not set yet\b/i;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The "## Heading" sections of a rule, in order. */
function sections(body: string) {
	const out = new Map<string, string>();
	const parts = body.replace(/\r\n/g, "\n").split(/^## (.+)$/m);
	for (let i = 1; i < parts.length; i += 2) out.set(parts[i].trim(), parts[i + 1].trim());
	return out;
}

const section = (body: string, heading: string) => {
	const v = sections(body).get(heading) ?? "";
	return NOT_SET.test(v) ? "" : v;
};

/**
 * The rule with these sections replaced. Everything else (title, intro, fixed guidance such as "How to use this",
 * sections the form doesn't know) is kept as it is; a missing section is added before "How to use this".
 */
export function writeSections(body: string, values: Record<string, string>, drop: string[] = []) {
	let out = body.replace(/\r\n/g, "\n");
	for (const heading of drop) out = out.replace(new RegExp(`^## ${escapeRe(heading)}\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, "m"), "");
	for (const [heading, raw] of Object.entries(values)) {
		const value = raw.replace(/\r\n/g, "\n").trim() || EMPTY[heading] || "- Not set yet.";
		const re = new RegExp(`(^## ${escapeRe(heading)}\\n)([\\s\\S]*?)(?=^## |^Other prolific readers|(?![\\s\\S]))`, "m");
		if (re.test(out)) out = out.replace(re, (_m, head) => `${head}${value}\n\n`);
		else if (/^## How to use this$/m.test(out)) out = out.replace(/^## How to use this$/m, `## ${heading}\n${value}\n\n## How to use this`);
		else out = `${out.trimEnd()}\n\n## ${heading}\n${value}\n`;
	}
	return out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const EMPTY: Record<string, string> = {
	"My preferences": "- Not set yet — assume physical books are fine, and second-hand is always fine.",
};

// ---- Simple forms --------------------------------------------------------------------------------------------

/** Current values for a rule's fields ("" when not set). Older rules without the headings still load. */
export function readSimple(t: ProfileRule, body: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const f of t.fields) {
		let v = sections(body).has(f.heading) ? section(body, f.heading) : legacyValue(t.rule, body);
		if (t.rule === "trusted-readers") v = v.split("\n").filter((l) => !/^Other prolific readers/.test(l)).join("\n").trim();
		values[f.heading] = NOT_SET.test(v) ? "" : v;
	}
	return values;
}

// Before v2.6 these two rules had no headings for the user's own part.
function legacyValue(rule: string, body: string) {
	const lines = body.split("\n").map((l) => l.trim());
	if (rule === "buying-preferences") return lines.filter((l) => l && !l.startsWith("#") && !l.startsWith("- ") && !/^Format preference: not set/i.test(l)).join("\n");
	if (rule === "trusted-readers") return lines.find((l) => l.includes(" · ")) ?? "";
	return "";
}

export function writeSimple(t: ProfileRule, body: string, values: Record<string, string>) {
	let out = body.replace(/\r\n/g, "\n");
	if (t.rule === "buying-preferences" && !/^## My preferences$/m.test(out)) {
		// Older buy-decision rules: drop the free-text preference lines; they move into the new section.
		out = out.split("\n").filter((l) => !(l.trim() && !l.startsWith("#") && !l.startsWith("- "))).join("\n").trimEnd();
	}
	if (t.rule === "trusted-readers" && !/^## People whose picks I trust$/m.test(out)) {
		out = out.split("\n").filter((l) => !l.includes(" · ") && !/^Starter list/.test(l)).join("\n").replace(/(Other prolific readers)/, "## People whose picks I trust\n\n$1");
	}
	return writeSections(out, Object.fromEntries(t.fields.map((f) => [f.heading, values[f.heading] ?? ""])));
}

// ---- Non-fiction profile -------------------------------------------------------------------------------------

export const WHY_OPTIONS = ["Fix a weak spot or reach a goal", "Think and decide better", "Understand how the world works", "Wisdom for living", "A skill for work", "Pure curiosity"];
export const SUBJECT_OPTIONS = ["Thinking & decisions", "Mind & people", "Science & nature", "History", "Power & society", "Economics & business", "Technology & AI", "Art", "Philosophy & meaning", "Lives & biography", "Health", "Sport"];
export const ORIGINALS_OPTIONS = ["Let the AI choose case by case", "Prefer originals when readable", "Prefer the best modern book"];
export const TIME_OPTIONS = ["About 2 hours a week", "About 5 hours a week", "About 7 hours a week", "10 or more hours a week"];

export const NONFICTION_SECTIONS = {
	why: "Why I read non-fiction",
	subjects: "Subjects",
	working: "What I'm working on",
	values: "Values",
	worth: "What makes a book worth it to me",
	breakers: "Deal-breakers",
	originals: "Originals and modern alternatives",
	time: "Time for reading",
} as const;
const LEGACY_TOPICS = "Topics I care about";
const LEGACY_DISLIKE = "What I dislike";

export type NonfictionProfile = {
	why: string[];
	subjectsIn: string[];
	subjectsOut: string[];
	working: string;
	values: string;
	worth: string;
	breakers: string;
	originalsPref: string;
	originalsText: string;
	time: string;
};

const plain = (s: string) => s.replace(/\*\*/g, "").trim();
const listItems = (text: string) =>
	text
		.split("\n")
		.map((l) => l.match(/^\s*(?:\d+[.)]|[-*•])\s+(.+)$/)?.[1] ?? "")
		.map(plain)
		.filter(Boolean);
const splitSubjects = (s: string) => s.split(/\s+·\s+|;|\n/).map((x) => plain(x).replace(/^[-*]\s*/, "").replace(/\.$/, "")).filter(Boolean);

export function readNonfiction(body: string): NonfictionProfile {
	const S = NONFICTION_SECTIONS;
	const subj = section(body, S.subjects);
	const lineAfter = (label: string) => subj.split("\n").find((l) => new RegExp(`^\\s*[-*]?\\s*(\\*\\*)?${label}:?(\\*\\*)?:?`, "i").test(l))?.replace(new RegExp(`^\\s*[-*]?\\s*(\\*\\*)?${label}:?(\\*\\*)?:?\\s*`, "i"), "") ?? "";
	let subjectsIn = splitSubjects(lineAfter("In"));
	const subjectsOut = splitSubjects(lineAfter("Out"));
	if (!subj && sections(body).has(LEGACY_TOPICS)) subjectsIn = section(body, LEGACY_TOPICS).split(/,|\n|\s+·\s+/).map((x) => plain(x).replace(/^[-*]\s*/, "").replace(/\.$/, "")).filter(Boolean);
	const orig = section(body, S.originals);
	const prefLine = orig.split("\n").find((l) => /^\s*[-*]\s*(\*\*)?Preference:?/i.test(l));
	const time = section(body, S.time);
	return {
		why: listItems(section(body, S.why)),
		subjectsIn,
		subjectsOut,
		working: section(body, S.working),
		values: section(body, S.values),
		worth: section(body, S.worth),
		breakers: section(body, S.breakers) || (sections(body).has(S.breakers) ? "" : section(body, LEGACY_DISLIKE)),
		originalsPref: prefLine ? plain(prefLine.replace(/^\s*[-*]\s*(\*\*)?Preference:?(\*\*)?:?\s*/i, "")).replace(/\.$/, "") : "",
		originalsText: orig.split("\n").filter((l) => l !== prefLine).join("\n").trim(),
		time: time ? plain(time.replace(/^\s*[-*]\s*/, "")).replace(/\.$/, "") : "",
	};
}

export function writeNonfiction(body: string, p: NonfictionProfile) {
	const S = NONFICTION_SECTIONS;
	const subjects = [p.subjectsIn.length ? `- **In:** ${p.subjectsIn.join(" · ")}` : "", p.subjectsOut.length ? `- **Out:** ${p.subjectsOut.join(" · ")}` : ""].filter(Boolean).join("\n");
	const originals = [p.originalsPref ? `- **Preference:** ${p.originalsPref}.` : "", p.originalsText.trim()].filter(Boolean).join("\n");
	return writeSections(
		body,
		{
			[S.why]: p.why.map((w, i) => `${i + 1}. ${w}`).join("\n"),
			[S.subjects]: subjects,
			[S.working]: p.working,
			[S.values]: p.values,
			[S.worth]: p.worth,
			[S.breakers]: p.breakers,
			[S.originals]: originals,
			[S.time]: p.time ? `- ${p.time}.` : "",
		},
		[LEGACY_TOPICS, LEGACY_DISLIKE],
	);
}

/** How many of the 8 sections are filled. */
export function nonfictionProgress(body: string) {
	const p = readNonfiction(body);
	const filled = [p.why.length, p.subjectsIn.length + p.subjectsOut.length, p.working, p.values, p.worth, p.breakers, p.originalsPref || p.originalsText, p.time].filter((x) => Boolean(x)).length;
	return { filled, total: 8 };
}

/** True when the reader hasn't said anything about themselves yet (drives the Home set-up card). */
export function profileIsEmpty(bodies: Record<string, string>) {
	const fiction = readSimple(SIMPLE_FORMS["fiction-profile"], bodies["fiction-profile"] ?? "")["What I want fiction to do"];
	return !fiction && nonfictionProgress(bodies["nonfiction-profile"] ?? "").filled === 0;
}

// ---- Quality rules: gates and weights ------------------------------------------------------------------------

export type Gate = { name: string; on: boolean; text: string };
export type Weight = { name: string; weight: number; question: string };

const GATE_LINE = /^-\s+(on|off)\s+·\s+\*\*(.+?):\*\*\s*(.*)$/;
const WEIGHT_ROW = /^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]*?)\s*\|/;

/** Gates ("- on · **Name:** text") and the weights table ("| Factor | Weight | Question | …") of a quality rule. */
export function readQuality(body: string): { gates: Gate[]; weights: Weight[] } {
	const lines = body.replace(/\r\n/g, "\n").split("\n");
	const gates = lines.map((l) => l.match(GATE_LINE)).filter((m): m is RegExpMatchArray => Boolean(m)).map((m) => ({ on: m[1] === "on", name: m[2].trim(), text: m[3].trim() }));
	const weights = lines
		.map((l) => l.match(WEIGHT_ROW))
		.filter((m): m is RegExpMatchArray => Boolean(m) && !/^-+$/.test(m![1]) && m![1] !== "Factor")
		.map((m) => ({ name: m[1].trim(), weight: Number(m[2]), question: m[3].trim() }));
	return { gates, weights };
}

export function writeQuality(body: string, gatesOn: Set<string>, weights: Record<string, number>) {
	return body
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((l) => {
			const g = l.match(GATE_LINE);
			if (g) return l.replace(/^-\s+(on|off)\s+·/, `- ${gatesOn.has(g[2].trim()) ? "on" : "off"} ·`);
			const w = l.match(WEIGHT_ROW);
			if (w && weights[w[1].trim()] !== undefined) {
				const n = Math.max(0, Math.min(9, Math.round(weights[w[1].trim()])));
				return l.replace(/^(\|\s*[^|]+?\s*\|\s*)\d+(\s*\|)/, `$1${n}$2`);
			}
			return l;
		})
		.join("\n");
}
