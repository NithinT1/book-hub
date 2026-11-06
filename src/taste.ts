// "Your taste": a simple form in the hub over four rules. The hub (not the AI) writes them; every save keeps the
// old version. Each field is one "## Heading" section of its rule, so the rule stays readable Markdown.
// A fuller taste framework (and an AI interview) comes later.

export type TasteField = { heading: string; label: string; placeholder: string; rows: number };
export type TasteRule = { rule: string; group: string; fields: TasteField[] };

export const TASTE: TasteRule[] = [
	{
		rule: "fiction-taste",
		group: "Fiction",
		fields: [
			{ heading: "What I want fiction to do", label: "What I want fiction to do", placeholder: "e.g. Clever mysteries. Big fantasy worlds. Stories set in other countries.", rows: 5 },
			{ heading: "Books or authors I loved", label: "Books or authors I loved", placeholder: "e.g. The Hobbit, Agatha Christie, Jane Austen", rows: 2 },
			{ heading: "Avoid", label: "Avoid", placeholder: "e.g. Graphic violence. Very long series.", rows: 3 },
			{ heading: "Other preferences", label: "Length and other preferences", placeholder: "e.g. Under 400 pages. Standalone books over series.", rows: 3 },
		],
	},
	{
		rule: "nonfiction-taste",
		group: "Non-fiction",
		fields: [
			{ heading: "Topics I care about", label: "Topics I care about", placeholder: "e.g. Space, cooking, World War II, startups", rows: 3 },
			{ heading: "What makes a book worth it to me", label: "What makes a book worth it to me", placeholder: "e.g. Things I can try. Real research. Written like a story.", rows: 3 },
			{ heading: "What I dislike", label: "What I dislike", placeholder: "e.g. Too much jargon. No practical takeaways.", rows: 3 },
		],
	},
	{
		rule: "buy-decision",
		group: "Buying",
		fields: [{ heading: "My preferences", label: "How I like to get books", placeholder: "e.g. Library first. Paperbacks. Audiobooks for long books.", rows: 3 }],
	},
	{
		rule: "trusted-readers",
		group: "Buying",
		fields: [{ heading: "People whose picks I trust", label: "People whose book picks I trust", placeholder: "e.g. A friend, a podcast host, a newspaper's book section", rows: 2 }],
	},
];

const NOT_SET = /^-?\s*not set yet\b/i;

/** The "## Heading" sections of a rule, in order. */
function sections(body: string) {
	const out = new Map<string, string>();
	const parts = body.split(/^## (.+)$/m);
	for (let i = 1; i < parts.length; i += 2) out.set(parts[i].trim(), parts[i + 1].trim());
	return out;
}

/** Current values for a rule's fields ("" when not set). Older rules without the headings still load. */
export function readTaste(t: TasteRule, body: string): Record<string, string> {
	const secs = sections(body);
	const values: Record<string, string> = {};
	for (const f of t.fields) {
		let v = secs.get(f.heading) ?? "";
		if (!secs.has(f.heading)) v = legacyValue(t.rule, body);
		if (t.rule === "trusted-readers") v = v.split("\n").filter((l) => !/^Other prolific readers/.test(l)).join("\n").trim();
		values[f.heading] = NOT_SET.test(v) ? "" : v;
	}
	return values;
}

// Before v2.6 these two rules had no headings for the user's own part.
function legacyValue(rule: string, body: string) {
	const lines = body.split("\n").map((l) => l.trim());
	if (rule === "buy-decision") return lines.filter((l) => l && !l.startsWith("#") && !l.startsWith("- ") && !/^Format preference: not set/i.test(l)).join("\n");
	if (rule === "trusted-readers") return lines.find((l) => l.includes(" · ")) ?? "";
	return "";
}

const EMPTY: Record<string, string> = {
	"What I want fiction to do": "- Not set yet.",
	"Books or authors I loved": "- Not set yet.",
	Avoid: "- Not set yet.",
	"Other preferences": "- Not set yet.",
	"Topics I care about": "- Not set yet.",
	"What makes a book worth it to me": "- Not set yet.",
	"What I dislike": "- Not set yet.",
	"My preferences": "- Not set yet — assume physical books are fine.",
	"People whose picks I trust": "- Not set yet.",
};

/**
 * The rule with the form's values written into its sections. Everything else in the rule (its title, intro,
 * fixed guidance such as "How to use this") is kept as it is; a missing section is added before "How to use this".
 */
export function writeTaste(t: TasteRule, body: string, values: Record<string, string>) {
	let out = body.replace(/\r\n/g, "\n");
	if (t.rule === "buy-decision" && !/^## My preferences$/m.test(out)) {
		// Drop the old free-text preference lines; they move into the new section.
		out = out.split("\n").filter((l) => !(l.trim() && !l.startsWith("#") && !l.startsWith("- "))).join("\n").trimEnd();
	}
	if (t.rule === "trusted-readers" && !/^## People whose picks I trust$/m.test(out)) {
		out = out.split("\n").filter((l) => !l.includes(" · ") && !/^Starter list/.test(l)).join("\n").replace(/(Other prolific readers)/, "## People whose picks I trust\n\n$1");
	}
	for (const f of t.fields) {
		const value = (values[f.heading] ?? "").replace(/\r\n/g, "\n").trim() || EMPTY[f.heading];
		const re = new RegExp(`(^## ${escapeRe(f.heading)}\\n)([\\s\\S]*?)(?=^## |^Other prolific readers|(?![\\s\\S]))`, "m");
		if (re.test(out)) out = out.replace(re, (_m, head) => `${head}${value}\n\n`);
		else if (/^## How to use this$/m.test(out)) out = out.replace(/^## How to use this$/m, `## ${f.heading}\n${value}\n\n## How to use this`);
		else out = `${out.trimEnd()}\n\n## ${f.heading}\n${value}\n`;
	}
	return out.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when nothing personal has been set yet (shows the Home card). */
export function tasteIsEmpty(bodies: Record<string, string>) {
	const fiction = readTaste(TASTE[0], bodies["fiction-taste"] ?? "")["What I want fiction to do"];
	const nonfiction = readTaste(TASTE[1], bodies["nonfiction-taste"] ?? "")["Topics I care about"];
	return !fiction && !nonfiction;
}
