import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getRules, getSource, listSources, logRequest, saveFeedback, saveRule, saveSource, type SourceInput } from "../src/db";
import { ensureDefaultRules } from "../src/rules-defaults";

const db = env.DB;

beforeEach(async () => {
	for (const t of ["appearances", "requests", "notes", "editions", "source_ids", "source_aliases", "facts", "cards", "verdict_history", "quizzes", "sources", "rules_history", "rules", "feedback"]) {
		await db.prepare(`DELETE FROM ${t}`).run();
	}
});

describe("saveSource", () => {
	it("creates, then matches a variant and remembers it as an alias", async () => {
		const a = await saveSource(db, { title: "Outliers", authors: ["Malcolm Gladwell"], type: "nonfiction" });
		expect(a.status).toBe("created");
		const b = await saveSource(db, { title: "Outlier", authors: ["Malcolm Gladwell"] });
		expect(b).toMatchObject({ status: "matched" });
		if (b.status !== "possible_duplicates") expect(b.source.aliases).toContain("Outlier");
		expect(await listSources(db)).toHaveLength(1);
	});

	it("keeps two translations of one work as editions of a single source", async () => {
		await saveSource(db, { title: "The Odyssey", authors: ["Homer"], edition: { label: "Robert Fagles translation", translator: "Robert Fagles", owned: true } });
		const r = await saveSource(db, { title: "The Odyssey", authors: ["Homer"], edition: { label: "Emily Wilson translation", translator: "Emily Wilson", notes: "want to read next" } });
		if (r.status === "possible_duplicates") throw new Error("unexpected");
		expect(r.source.editions.map((e) => e.label)).toEqual(["Robert Fagles translation", "Emily Wilson translation"]);
		expect(r.source.editions[0].owned).toBe(1);
	});

	it("matches on ISBN or Open Library id even if the title differs", async () => {
		await saveSource(db, { title: "The Lord of the Rings", authors: ["J. R. R. Tolkien"], ol_work: "OL27448W" });
		const r = await saveSource(db, { title: "LOTR", authors: ["J. R. R. Tolkien"], ol_work: "OL27448W" });
		expect(r.status).toBe("matched");
	});

	it("asks before merging a possible duplicate, then honours the answer", async () => {
		await saveSource(db, { title: "Harry Potter and the Chamber of Secrets", authors: ["J. K. Rowling"] });
		const r = await saveSource(db, { title: "Harry Potter and the Goblet of Fire", authors: ["J. K. Rowling"] });
		expect(r.status).toBe("possible_duplicates");
		const confirmed = await saveSource(db, { title: "Harry Potter and the Goblet of Fire", authors: ["J. K. Rowling"], confirm_new: true });
		expect(confirmed.status).toBe("created");
		expect(await listSources(db)).toHaveLength(2);
	});

	it("only fills gaps on a match and never moves library status backwards", async () => {
		const first = await saveSource(db, { title: "Quiet", authors: ["Susan Cain"], year: 2012, year_source: "openlibrary", library_status: "finished" });
		const r = await saveSource(db, { title: "Quiet", authors: ["Susan Cain"], year: 1999, pages: 352, pages_source: "openlibrary", library_status: "on_shelf" });
		if (r.status === "possible_duplicates" || first.status === "possible_duplicates") throw new Error("unexpected");
		expect(r.source).toMatchObject({ year: 2012, pages: 352, library_status: "finished", finished_on: null });
	});

	it("records a finished date only when given", async () => {
		const r = await saveSource(db, { title: "Brave New World", authors: ["Aldous Huxley"], library_status: "finished", finished_on: "2024-05-01" });
		if (r.status === "possible_duplicates") throw new Error("unexpected");
		expect(r.source.finished_on).toBe("2024-05-01");
	});
});

describe("the user's 20 books", () => {
	// How Claude should save the list as typed (cleaned up per the connector guide).
	const library: SourceInput[] = [
		{ title: "The Name of the Rose", authors: ["Umberto Eco"], type: "fiction", aliases: ["Umberto Eco - Name of the Rose"] },
		{ title: "The Little Prince", authors: ["Antoine de Saint-Exupéry"], type: "fiction", aliases: ["Le Petit Prince"] },
		{ title: "Sapiens", authors: ["Yuval Noah Harari"], type: "nonfiction", aliases: ["Sapeins - Yuval Harrari"] },
		{ title: "Before the Coffee Gets Cold", authors: ["Toshikazu Kawaguchi"], type: "fiction", aliases: ["Coffee Gets Cold"] },
		{ title: "Pride and Prejudice", authors: ["Jane Austen"], type: "fiction", aliases: ["Pride and Predjudice"] },
		{ title: "Murder on the Orient Express", authors: ["Agatha Christie"], type: "fiction" },
		{ title: "And Then There Were None", authors: ["Agatha Christie"], type: "fiction" },
		{ title: "The Lord of the Rings", authors: ["J. R. R. Tolkien"], type: "fiction", aliases: ["LOTR"] },
		{ title: "Brave New World", authors: ["Aldous Huxley"], type: "fiction" },
		{ title: "The Odyssey", authors: ["Homer"], type: "fiction", edition: { label: "Emily Wilson translation", translator: "Emily Wilson", owned: true } },
		{ title: "Tao Te Ching", authors: ["Laozi"], type: "nonfiction", aliases: ["Tao Teh King", "Daodejing"], edition: { label: "Stephen Mitchell translation", translator: "Stephen Mitchell", owned: true } },
		{ title: "Freakonomics", authors: ["Steven D. Levitt", "Stephen J. Dubner"], type: "nonfiction" },
		{ title: "Outliers", subtitle: "The Story of Success", authors: ["Malcolm Gladwell"], type: "nonfiction" },
		{ title: "Quiet", authors: ["Susan Cain"], type: "nonfiction" },
		{ title: "The Intelligent Investor", authors: ["Benjamin Graham"], type: "nonfiction" },
		{ title: "Good to Great", authors: ["Jim Collins"], type: "nonfiction" },
		{ title: "The Hobbit", authors: ["J. R. R. Tolkien"], type: "fiction" },
		{ title: "Charlotte's Web", authors: ["E. B. White"], type: "fiction", aliases: ["Charlotes web"] },
		{ title: "Grit", authors: ["Angela Duckworth"], type: "nonfiction" },
		{ title: "The Body: A Guide for Occupants", authors: ["Bill Bryson"], type: "nonfiction", aliases: ["The Body"] },
	];
	// The same books written differently, as they might come up later.
	const variants: SourceInput[] = [
		{ title: "Name of the Rose", authors: ["Umberto Eco"] },
		{ title: "LOTR", authors: ["J.R.R. Tolkien"] },
		{ title: "Outlier", authors: ["Malcolm Gladwell"] },
		{ title: "Tao Te Ching", authors: ["Laozi"], edition: { label: "Ursula K. Le Guin version", translator: "Ursula K. Le Guin", notes: "want to read next" } },
		{ title: "Tao Teh King", authors: ["Laozi"] },
		{ title: "Charlotte’s Web", authors: ["E.B. White"] },
		{ title: "Outliers: The Story of Success", authors: ["Malcolm Gladwell"] },
		{ title: "The Hobbit: Or There and Back Again", authors: ["J.R.R. Tolkien"] },
		{ title: "Sapiens: A Brief History of Humankind", authors: ["Yuval Noah Harari"] },
		{ title: "The Body", authors: ["Bill Bryson"] },
		{ title: "And Then There Were None", authors: ["Agatha Christie"] },
		{ title: "The Intelligent Investor", authors: ["Benjamin Graham"] },
	];

	it("saves all 20 as separate sources, and every variant matches with no duplicates", async () => {
		for (const book of library) expect((await saveSource(db, book)).status).toBe("created");
		expect(await listSources(db, { limit: 200 })).toHaveLength(20);
		for (const v of variants) expect((await saveSource(db, v)).status, v.title).toBe("matched");
		expect(await listSources(db, { limit: 200 })).toHaveLength(20);
	});
});

describe("requests and appearances", () => {
	it("doesn't double-count a re-run of the same request", async () => {
		const s = await saveSource(db, { title: "Influence", authors: ["Robert Cialdini"] });
		if (s.status === "possible_duplicates") throw new Error("unexpected");
		const first = await logRequest(db, "recs", "books on persuasion", [{ source_id: s.source.id, rank: 1, origin: "recommended" }]);
		const again = await logRequest(db, "recs", "Books on persuasion!", [{ source_id: s.source.id, rank: 1, origin: "recommended" }]);
		expect(again).toEqual({ request_id: first.request_id, repeat: true });
		await logRequest(db, "recs", "how to negotiate", [{ source_id: s.source.id, rank: 2, origin: "recommended" }]);
		await logRequest(db, "details", "Influence", [{ source_id: s.source.id, origin: "lookup" }]);
		expect((await getSource(db, s.source.id))!.appearance_count).toBe(2);
	});
});

describe("rules", () => {
	it("seeds defaults once, keeps edits, and versions every change", async () => {
		await ensureDefaultRules(db);
		const before = await getRules(db);
		expect(before.map((r) => r.name)).toEqual(expect.arrayContaining(["quality-nonfiction", "fit", "verdict", "handover", "nonfiction-profile"]));
		expect(before.map((r) => r.name)).not.toContain("timeless-nonfiction");
		expect(before.find((r) => r.name === "ranking")!.title).toBe("Ranking");

		expect(await saveRule(db, "ranking", "Ranking", "# Ranking\nedited")).toBe(2);
		await ensureDefaultRules(db);
		const [ranking] = await getRules(db, ["ranking"]);
		expect(ranking).toMatchObject({ body: "# Ranking\nedited", version: 2 });
		const history = await db.prepare("SELECT version FROM rules_history WHERE name = 'ranking'").all();
		expect(history.results).toEqual([{ version: 1 }]);
	});
});

describe("feedback", () => {
	it("saves feedback as open", async () => {
		const row = await saveFeedback(db, "Odyssey answer mixed two translations", "discussion on book 9");
		const saved = await db.prepare("SELECT status FROM feedback WHERE id = ?").bind(row!.id).first();
		expect(saved).toEqual({ status: "open" });
	});
});
