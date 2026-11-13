import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findReferenceScore, getRules, getSource, listSources, saveCard, saveRule, saveSource, setVerdict } from "../src/db";
import { nonfictionProgress, readNonfiction, readQuality, writeNonfiction, writeQuality } from "../src/profile";
import { DEFAULT_RULES, ensureDefaultRules, FLOWS, RULE_INFO, rulesForFlow } from "../src/rules-defaults";
import { createSessionCookie } from "../src/session";

const db = env.DB;
const worker = (exports as any).default;
const BASE = "https://book-hub.example.workers.dev";
let cookie = "";
const get = (path: string) => worker.fetch(new Request(BASE + path, { headers: { Cookie: cookie } }), { redirect: "manual" });
const post = (path: string, fields: Record<string, string> | [string, string][]) =>
	worker.fetch(new Request(BASE + path, { method: "POST", headers: { Cookie: cookie, Origin: BASE }, body: new URLSearchParams(fields) }), { redirect: "manual" });
const book = async (title: string, extra: Record<string, unknown> = {}) => {
	const r = await saveSource(db, { title, authors: ["Author " + title], confirm_new: true, ...extra } as any);
	if (r.status === "possible_duplicates") throw new Error("unexpected");
	return r.source.id;
};

beforeEach(async () => {
	cookie = (await createSessionCookie("owner", env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
	for (const t of ["appearances", "requests", "notes", "facts", "cards", "verdict_history", "quizzes", "source_tags", "source_aliases", "sources", "rules_history", "rules", "settings", "reference_scores"]) await db.prepare(`DELETE FROM ${t}`).run();
});

describe("rules: flows and catalogue", () => {
	it("every rule a flow names exists, and every bundled rule is described", () => {
		for (const [flow, names] of Object.entries(FLOWS)) for (const n of names) expect(DEFAULT_RULES, `${flow}: ${n}`).toHaveProperty(n);
		for (const n of Object.keys(DEFAULT_RULES)) expect(RULE_INFO, n).toHaveProperty(n);
	});
	it("a flow also returns rules the reader added themselves", () => {
		expect(rulesForFlow("store", ["honesty", "my-own-rule"])).toContain("my-own-rule");
		expect(rulesForFlow("discuss", [])).toEqual(["discussion", "honesty", "handover"]);
	});
	it("starter profiles start empty", () => {
		for (const name of ["nonfiction-profile", "fiction-profile"]) expect(nonfictionProgress(DEFAULT_RULES[name]).filled, name).toBe(0);
		expect(DEFAULT_RULES["nonfiction-profile"]).toContain("Not set yet");
	});
});

describe("verdict", () => {
	it("is saved with the card, kept in history, and never changes the status", async () => {
		const id = await book("Deep Mechanisms", { library_status: "want_to_buy" });
		const r = await saveCard(db, id, { markdown: "card", quality: 8.3, quality_tier: "strong", fit: 8, fit_label: "self", verdict: "read", verdict_how: "second_hand", verdict_why: "Main book for a goal" });
		expect(r.verdict).toBe("saved");
		let s = (await getSource(db, id))!;
		expect(s).toMatchObject({ verdict: "read", verdict_how: "second_hand", verdict_by: "ai", library_status: "want_to_buy" });
		expect(s.research.card).toMatchObject({ quality: 8.3, fit: 8 });
		expect(s.research.card).not.toHaveProperty("verdict");
		const again = await saveCard(db, id, { markdown: "card", verdict: "idea_only", verdict_why: "You finished a book that covers it" });
		expect(again).toMatchObject({ verdict: "changed", previous: "read" });
		s = (await getSource(db, id))!;
		expect(s.verdict_history.map((h) => h.verdict)).toEqual(["idea_only", "read"]);
		expect(s.library_status).toBe("want_to_buy");
	});
	it("the reader's own verdict is locked against the AI until unlocked", async () => {
		const id = await book("My Call");
		await setVerdict(db, id, { verdict: "read", by: "me", why: "I want to" });
		expect(await saveCard(db, id, { markdown: "c", verdict: "skip" })).toMatchObject({ verdict: "locked", current: "read" });
		expect((await getSource(db, id))!.verdict).toBe("read");
		await post(`/book/${id}/verdict/unlock`, {});
		expect((await saveCard(db, id, { markdown: "c", verdict: "skip" })).verdict).toBe("changed");
	});
	it("an older card's buy decision still maps to a verdict", async () => {
		const id = await book("Old Style");
		await saveCard(db, id, { markdown: "c", buy: "summary" });
		expect((await getSource(db, id))!.verdict).toBe("idea_only");
	});
});

describe("hub screens", () => {
	it("the book page shows the score strip, and the reader can set and lock a verdict", async () => {
		const id = await book("Strip Book");
		await saveCard(db, id, { markdown: "c", quality: 7.8, quality_tier: "strong", quality_factors: { Foundation: 4, Reach: 3 }, timeless: "yes", fit: 6, fit_label: "general", fit_reason: "A must-know", verdict: "read", verdict_how: "first_hand", belief: "A named belief", mistake: "A named mistake" });
		const page = await (await get(`/book/${id}`)).text();
		for (const t of ["<span class=\"v\">Yes</span>", "7.8 · Strong", "6 · General", "Read · first-hand", "A must-know", "Belief it breaks", "Foundation", "Set my verdict"]) expect(page).toContain(t);
		await post(`/book/${id}/verdict`, { verdict: "bench", how: "", why: "Later" });
		const s = (await getSource(db, id))!;
		expect(s).toMatchObject({ verdict: "bench", verdict_by: "me", verdict_why: "Later" });
		expect(await (await get(`/book/${id}`)).text()).toContain("🔒 Your verdict");
	});
	it("Discover hides Skip unless asked, filters by verdict and fit label, and shows the Home pointer until dismissed", async () => {
		const a = await book("Skip Me");
		const b = await book("Read Me");
		await saveCard(db, a, { markdown: "c", verdict: "skip" });
		await saveCard(db, b, { markdown: "c", verdict: "read", fit: 9, fit_label: "general_self", quality: 9 });
		let page = await (await get("/discover")).text();
		expect(page).toContain("Read Me");
		expect(page).not.toContain("Skip Me");
		expect(page).toContain("Looking for something new?");
		expect(await (await get("/discover?verdict=skip")).text()).toContain("Skip Me");
		page = await (await get("/discover?for=self")).text();
		expect(page).not.toContain("Read Me");
		expect(await (await get("/discover?for=general_self")).text()).toContain("Read Me");
		await post("/discover/pointer/hide", {});
		expect(await (await get("/discover")).text()).not.toContain("Looking for something new?");
	});
	it("best first puts higher Quality × Fit first, and changed verdicts are listed", async () => {
		const low = await book("Lower Fit");
		const high = await book("Higher Fit");
		await saveCard(db, low, { markdown: "c", quality: 8, fit: 4, verdict: "read" });
		await saveCard(db, high, { markdown: "c", quality: 8, fit: 9, verdict: "read" });
		const rows = await listSources(db, { sort: "best" });
		expect(rows.map((r) => r.title).indexOf("Higher Fit")).toBeLessThan(rows.map((r) => r.title).indexOf("Lower Fit"));
		await saveCard(db, low, { markdown: "c", verdict: "idea_only" });
		expect((await listSources(db, { verdictChanged: true })).map((r) => r.title)).toEqual(["Lower Fit"]);
		expect(await (await get("/")).text()).toContain("Verdict changed recently");
	});
	it("the Buy list notes a verdict that moved away from reading, without moving the book", async () => {
		const id = await book("Listed Then Changed", { library_status: "want_to_buy" });
		await db.prepare("UPDATE sources SET status_changed_at = '2020-01-01T00:00:00Z' WHERE id = ?").bind(id).run();
		await saveCard(db, id, { markdown: "c", verdict: "idea_only", verdict_why: "Covered by a finished book" });
		const page = await (await get("/buy")).text();
		expect(page).toContain("Verdict now Idea only: Covered by a finished book");
		expect((await getSource(db, id))!.library_status).toBe("want_to_buy");
	});
});

describe("non-fiction profile", () => {
	const rich = `# Non-fiction profile

Intro line.

## Why I read non-fiction
1. Get better at my job (Self).
2. Understand how things work.

## Subjects
- **In:** space · cooking
- **Out:** sport · gardening, birds, weather (except storms)

## What I'm working on
| # | Need |
|---|---|
| G1 | Run a small team |

## Values
- **Held:** patience.

## What makes a book worth it to me
- Short.

## Deal-breakers
- Jargon.

## Originals and modern alternatives
- **Preference:** Prefer the best modern book.
- Translations: The Odyssey → Emily Wilson.

## Time for reading
- About 5 hours a week.

## Extra notes
Something the form doesn't know about.

## How to use this
- Fixed guidance.
`;
	it("reads every section and writes it back without losing a line", () => {
		const p = readNonfiction(rich);
		expect(p.why).toEqual(["Get better at my job (Self).", "Understand how things work."]);
		expect(p.subjectsIn).toEqual(["space", "cooking"]);
		expect(p.subjectsOut).toEqual(["sport", "gardening, birds, weather (except storms)"]);
		expect(p.originalsPref).toBe("Prefer the best modern book");
		expect(p.time).toBe("About 5 hours a week");
		expect(nonfictionProgress(rich).filled).toBe(8);
		const out = writeNonfiction(rich, p);
		for (const line of rich.split("\n").map((l) => l.trim()).filter(Boolean)) expect(out, line).toContain(line);
		expect(writeNonfiction(out, readNonfiction(out))).toBe(out);
	});
	it("the form saves chips, subjects in and out, and moves older sections", async () => {
		await ensureDefaultRules(db);
		await saveRule(db, "nonfiction-profile", "Non-fiction profile", "# Non-fiction profile\n\n## Topics I care about\n- Space, cooking\n\n## What I dislike\n- Jargon\n\n## How to use this\n- Fixed.\n");
		expect(await (await get("/rules/nonfiction-profile")).text()).toContain("Jargon");
		await post("/rules/nonfiction-profile/form", [
			["why", "Pure curiosity"],
			["why_add", "My own reason"],
			["subject:Space", "in"],
			["subject:Sport", "out"],
			["breakers", "- Jargon"],
			["time", "About 5 hours a week"],
		]);
		const [r] = await getRules(db, ["nonfiction-profile"]);
		expect(r.body).toContain("1. Pure curiosity\n2. My own reason");
		expect(r.body).toContain("- **In:** Space\n- **Out:** Sport");
		expect(r.body).toContain("## Deal-breakers\n- Jargon");
		expect(r.body).toContain("## Time for reading\n- About 5 hours a week.");
		expect(r.body).not.toContain("## Topics I care about");
		expect(r.body).toContain("## How to use this\n- Fixed.");
	});
});

describe("quality rule form", () => {
	it("turns gates off and changes weights, keeping the rest of the rule", async () => {
		const q = readQuality(DEFAULT_RULES["quality-nonfiction"]);
		expect(q.gates.map((g) => g.name)).toEqual(["Fact pile", "Stretched", "Repackaged", "False", "Perishable"]);
		expect(q.weights.map((w) => [w.name, w.weight])).toEqual([["Foundation", 4], ["Reach", 4], ["Thinking tool", 4], ["Evidence", 4], ["Durability", 4]]);
		const out = writeQuality(DEFAULT_RULES["quality-nonfiction"], new Set(["Fact pile", "False"]), { Foundation: 3, Reach: 2 });
		const after = readQuality(out);
		expect(after.gates.filter((g) => g.on).map((g) => g.name)).toEqual(["Fact pile", "False"]);
		expect(after.weights.find((w) => w.name === "Reach")!.weight).toBe(2);
		expect(out).toContain("## Timeless");
		await ensureDefaultRules(db);
		await post("/rules/quality-nonfiction/form", [["gate", "Stretched"], ["weight:Foundation", "5"]]);
		const [r] = await getRules(db, ["quality-nonfiction"]);
		expect(readQuality(r.body).weights[0]).toMatchObject({ name: "Foundation", weight: 5 });
		expect(readQuality(r.body).gates.filter((g) => g.on).map((g) => g.name)).toEqual(["Stretched"]);
		expect(await (await get("/more")).text()).toContain("Customised");
		await post("/rules/quality-nonfiction/reset", {});
		expect((await getRules(db, ["quality-nonfiction"]))[0].body).toBe(DEFAULT_RULES["quality-nonfiction"]);
	});
});

describe("reference scores", () => {
	it("matches by title and author, converts 0–100 to 0–10, and shows on the book page", async () => {
		await db.prepare("INSERT INTO reference_scores (title, author, score, tier, factors) VALUES ('The Structure of Scientific Revolutions', 'Thomas Kuhn', 92, 'Core', 'F5 R5'), ('Influence', 'Robert Cialdini', 81, 'Strong', NULL)").run();
		expect(await findReferenceScore(db, "Structure of Scientific Revolutions", "Kuhn")).toMatchObject({ quality: 9.2, tier: "Core" });
		expect(await findReferenceScore(db, "Influence", "Someone Else")).toBeNull();
		expect(await findReferenceScore(db, "Unknown Book", "Nobody")).toBeNull();
		const id = await book("Influence", { authors: ["Robert B. Cialdini"] });
		const page = await (await get(`/book/${id}`)).text();
		expect(page).toContain("8.1 · Strong");
		expect(page).toContain("From your saved scores");
	});
});

describe("book quiz", () => {
	const ideas = [
		{ idea: "Core idea one", core: true, result: "held" as const, note: "The answer" },
		{ idea: "Core idea two", core: true, result: "held" as const },
		{ idea: "Supporting idea", result: "partly" as const },
	];
	it("a finished quiz sets and locks the Verdict, never the status, and a skip leaves Discover", async () => {
		const { saveQuiz } = await import("../src/db");
		const id = await book("Quizzed Book", { type: "nonfiction", library_status: "want_to_buy" });
		await saveCard(db, id, { markdown: "c", verdict: "read" });
		const r = await saveQuiz(db, id, { score: 8.6, outcome: "skip", verdict: "skip", ideas, ideas_left: ["Supporting idea"] });
		expect(r.verdict).toMatchObject({ verdict: "changed" });
		let s = (await getSource(db, id))!;
		expect(s).toMatchObject({ verdict: "skip", verdict_by: "quiz", verdict_locked: true, library_status: "want_to_buy" });
		expect((await saveCard(db, id, { markdown: "c", verdict: "read" })).verdict).toBe("locked");
		await db.prepare("UPDATE sources SET library_status = 'none' WHERE id = ?").bind(id).run();
		expect(await (await get("/discover")).text()).not.toContain("Quizzed Book");
		expect(await (await get("/discover?quiz=skip")).text()).toContain("You know 8.6/10");
		const page = await (await get(`/book/${id}`)).text();
		for (const t of ["You already know: <strong>8.6/10</strong>", "Quizzed: skip", "Core idea one", "The answer", "Ideas left for you", "🔒 From your quiz", "Retake quiz"]) expect(page).toContain(t);
		// The reader's own verdict, set later, wins over the quiz.
		await post(`/book/${id}/verdict`, { verdict: "read", how: "" });
		s = (await getSource(db, id))!;
		expect(s).toMatchObject({ verdict: "read", verdict_by: "me" });
	});
	it("a partial quiz keeps the Verdict and shows on Home until finished; info only informs", async () => {
		const { saveQuiz } = await import("../src/db");
		const id = await book("Half Done", { type: "nonfiction" });
		await saveCard(db, id, { markdown: "c", verdict: "read" });
		await saveQuiz(db, id, { score: 6, partial: true, ideas });
		expect((await getSource(db, id))!.verdict_by).toBe("ai");
		const home = await (await get("/")).text();
		expect(home).toContain("Finish your quiz");
		expect(home).toContain(encodeURIComponent("/book-quiz Continue my quiz on Half Done"));
		expect(await (await get(`/book/${id}`)).text()).toContain("Continue quiz");
		await saveQuiz(db, id, { score: 4, outcome: "info", verdict: "skip", ideas });
		expect((await getSource(db, id))!).toMatchObject({ verdict: "read", verdict_by: "ai" });
		expect(await (await get("/")).text()).not.toContain("Finish your quiz");
	});
	it("progress after every answer stays one record, which the final result completes", async () => {
		const { saveQuiz, getQuizzes } = await import("../src/db");
		const id = await book("Step By Step", { type: "nonfiction" });
		await saveQuiz(db, id, { score: 0, partial: true, ideas: [ideas[0]] });
		await saveQuiz(db, id, { score: 5, partial: true, ideas: ideas.slice(0, 2) });
		let q = await getQuizzes(db, id);
		expect(q).toHaveLength(1);
		expect(q[0]).toMatchObject({ partial: true, score: 5 });
		expect(await (await get("/")).text()).toContain("2 answered");
		await saveQuiz(db, id, { score: 7, outcome: "keep", verdict: "read_parts", ideas });
		q = await getQuizzes(db, id);
		expect(q).toHaveLength(1);
		expect(q[0]).toMatchObject({ partial: false, score: 7, outcome: "keep" });
		// A retake later starts a new record and keeps the old result in history.
		await saveQuiz(db, id, { score: 2, partial: true, ideas: [ideas[0]] });
		expect(await getQuizzes(db, id)).toHaveLength(2);
	});
	it("Quiz me sits under ⋯ for non-fiction only, never as a list button", async () => {
		await book("Idea Book", { type: "nonfiction" });
		await book("Story Book", { type: "fiction" });
		const page = await (await get("/discover")).text();
		const ideaRow = page.slice(page.indexOf("Idea Book"), page.indexOf("Idea Book") + 3000);
		expect(ideaRow).toMatch(/class="menu-item"[^>]*>Quiz me</);
		expect(page).not.toMatch(/class="act[^"]*"[^>]*>Quiz me</);
		const storyRow = page.slice(page.indexOf("Story Book"), page.indexOf("Story Book") + 3000);
		expect(storyRow.split("</li>")[0]).not.toContain("Quiz me");
	});
	it("the quiz flow returns its rules", () => {
		expect(rulesForFlow("quiz", [])).toEqual(expect.arrayContaining(["quiz", "verdict", "fit", "nonfiction-profile"]));
		expect(DEFAULT_RULES.quiz).toContain("You already know");
	});
});

describe("search", () => {
	it("is in the top bar of every page, and Home starts with Ask AI", async () => {
		for (const path of ["/", "/discover", "/buy", "/more"]) {
			const page = await (await get(path)).text();
			expect(page, path).toContain('class="search-button" href="/search"');
			expect(page, path).toContain('<form class="searchbar" method="get" action="/search" role="search" hidden>');
		}
		expect(await (await get("/")).text()).not.toContain('action="/discover"><input type="search"');
		expect(await (await get("/")).text()).toContain("[hidden]{display:none!important}"); // the search field starts closed
	});
	it("Home's Ask AI has a Book Quiz button right after Book details, fed by the topic box", async () => {
		const home = await (await get("/")).text();
		expect(home.indexOf(">Book details</a>")).toBeLessThan(home.indexOf(">Book Quiz</a>"));
		expect(home.indexOf(">Book Quiz</a>")).toBeLessThan(home.indexOf(">At a book store<"));
		expect(home).toContain('id="quiz-link"');
		expect(home).toContain('link("quiz-link", "/book-quiz ")');
	});
	it("shows your books first, and Archived & Skipped below only when they match", async () => {
		await book("Rivers of Thought", { library_status: "own" });
		const archived = await book("Rivers Archived", { library_status: "archived" });
		const skipped = await book("Rivers Skipped");
		await saveCard(db, skipped, { markdown: "c", verdict: "skip" });
		let page = await (await get("/search?q=rivers")).text();
		expect(page).toContain("Your books <span class=\"muted\">(1)</span>");
		expect(page).toContain("Archived &amp; Skipped <span class=\"muted\">(2)</span>");
		expect(page.indexOf("Rivers of Thought")).toBeLessThan(page.indexOf("Rivers Archived"));
		expect(page).toContain("Also matching");
		page = await (await get("/search?q=archived")).text();
		expect(page).toContain("No match in your books for");
		expect(page).toContain("Showing matches among books you archived or decided to skip");
		page = await (await get("/search?q=thought")).text();
		expect(page).not.toContain("Archived &amp; Skipped");
		page = await (await get("/search?q=nothing-like-this")).text();
		expect(page).toContain("Nothing in your hub matches");
		expect(page).not.toContain("Your books <span");
		expect(archived).toBeGreaterThan(0);
	});
});

describe("pins on My shelf", () => {
	it("pins up to 5 shelf books in my order, on top of My shelf and first on Home", async () => {
		const ids: number[] = [];
		for (const t of ["Pin One", "Pin Two", "Pin Three", "Pin Four", "Pin Five", "Pin Six"]) ids.push(await book(t, { library_status: "reading" }));
		const notMine = await book("Not On Shelf");
		for (const id of ids.slice(0, 5)) expect((await post(`/book/${id}/pin`, { back: "/shelf" })).headers.get("Location")).toBe("/shelf");
		// A sixth is refused and explained.
		const full = await post(`/book/${ids[5]}/pin`, { back: "/shelf" });
		expect(full.headers.get("Location")).toContain(`/pins/full?book=${ids[5]}`);
		expect(await (await get(full.headers.get("Location")!)).text()).toContain("You have 5 pinned books already");
		// Only shelf books can be pinned.
		await post(`/book/${notMine}/pin`, { back: "/shelf" });
		expect((await getSource(db, notMine))!.pin_rank).toBeNull();
		// Reorder: Pin Two moves up.
		await post(`/book/${ids[1]}/pin-move`, { dir: "up", back: "/shelf" });
		let shelf = await (await get("/shelf")).text();
		expect(shelf).toContain("📌 Pinned <span class=\"muted\">(5/5)</span>");
		expect(shelf.indexOf("Pin Two")).toBeLessThan(shelf.indexOf("Pin One"));
		expect(shelf.indexOf("Pin Five")).toBeLessThan(shelf.indexOf("Pin Six"));
		expect(shelf.split("<strong>Pin One</strong>").length).toBe(2); // not repeated in the list below
		const home = await (await get("/")).text();
		expect(home.indexOf("Pin Two")).toBeLessThan(home.indexOf("Pin One")); // pins first, in my order
		expect(home).not.toContain("<strong>Pin Six</strong>"); // Reading now shows 5: here, all pins
		// Finishing a pinned book unpins it and frees a place.
		const { setStatus } = await import("../src/library");
		await setStatus(db, ids[0], "finished");
		expect((await getSource(db, ids[0]))!.pin_rank).toBeNull();
		expect((await getSource(db, ids[1]))!.pin_rank).toBe(1);
		await post(`/book/${ids[5]}/pin`, { back: "/shelf" });
		expect((await getSource(db, ids[5]))!.pin_rank).toBe(5);
		await post(`/book/${ids[5]}/unpin`, { back: "/shelf" });
		expect((await getSource(db, ids[5]))!.pin_rank).toBeNull();
		shelf = await (await get("/shelf")).text();
		expect(shelf).toContain("(4/5)");
	});
});
