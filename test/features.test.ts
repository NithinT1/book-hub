import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addNote,
	getReadingProfile,
	getSource,
	listDiscussions,
	logRequest,
	mergeSources,
	mostFeaturedIds,
	parseMostFeaturedRule,
	saveCard,
	saveDiscussion,
	saveFacts,
	saveRule,
	saveSource,
	saveSummary,
} from "../src/db";
import { buildMarkdownExport } from "../src/export";
import { renderMarkdown } from "../src/markdown";
import { createSessionCookie } from "../src/session";

const db = env.DB;
const worker = (exports as any).default;
const BASE = "https://book-hub.example.workers.dev";

async function book(title: string, extra = {}) {
	const r = await saveSource(db, { title, authors: ["Author " + title], confirm_new: true, ...extra });
	if (r.status === "possible_duplicates") throw new Error("unexpected");
	return r.source.id;
}

beforeEach(async () => {
	for (const t of ["appearances", "requests", "notes", "editions", "source_ids", "source_aliases", "facts", "cards", "discussions", "summaries", "sources", "rules_history", "rules", "test_runs"]) await db.prepare(`DELETE FROM ${t}`).run();
});

describe("saved research", () => {
	it("returns the card and the newest fact per field, with age", async () => {
		const id = await book("Influence");
		await saveCard(db, id, { markdown: "**Author:** Cialdini", timeless: "yes", buy: "first_hand" });
		await saveFacts(db, id, [
			{ field: "price_inr", value: "₹450", link: "https://example.com/a" },
			{ field: "endorsement", value: "Charlie Munger", link: "https://example.com/m" },
			{ field: "endorsement", value: "Bill Gates", link: "https://example.com/g" },
		]);
		await saveFacts(db, id, [{ field: "price_inr", value: "₹399", link: "https://example.com/b" }]);
		const s = await getSource(db, id);
		expect(s!.research.card).toMatchObject({ timeless: "yes", buy: "first_hand", age_days: 0 });
		const prices = s!.research.facts.filter((f: any) => f.field === "price_inr");
		expect(prices.map((f: any) => f.value)).toEqual(["₹399"]);
		expect(s!.research.facts.filter((f: any) => f.field === "endorsement")).toHaveLength(2);
	});
});

describe("discussions and summaries", () => {
	it("saves, updates when continued, and searches", async () => {
		const id = await book("The Odyssey");
		const first = await saveDiscussion(db, { source_id: id, locator: "Book 9", title: "The Cyclops", body: "## Key points\n- cunning" });
		const again = await saveDiscussion(db, { source_id: id, title: "The Cyclops", body: "## Key points\n- cunning\n- pride", discussion_id: first.id });
		expect(again).toEqual({ id: first.id, updated: true });
		expect((await listDiscussions(db, { query: "pride" }))[0].locator).toBe("Book 9");
		const sum = await saveSummary(db, id, "# Summary\nlong text");
		expect((await getSource(db, id))!.summary_count).toBe(1);
		expect(sum!.id).toBeGreaterThan(0);
	});
});

describe("most featured", () => {
	it("reads the thresholds from the rule", () => {
		expect(parseMostFeaturedRule("in the **top 5%** … in **at least 3 separate requests**")).toEqual({ percent: 5, minRequests: 3 });
		expect(parseMostFeaturedRule("top 10% and at least 2 separate requests")).toEqual({ percent: 10, minRequests: 2 });
		expect(parseMostFeaturedRule(undefined)).toEqual({ percent: 5, minRequests: 3 });
	});
	it("needs at least 3 separate requests and counts re-runs and lookups once/never", async () => {
		const ids = [];
		for (let i = 0; i < 40; i++) ids.push(await book(`Book ${i}`));
		const [star, two] = ids;
		for (const q of ["a", "b", "c"]) await logRequest(db, "recs", q, [{ source_id: star, origin: "recommended" }]);
		await logRequest(db, "recs", "a", [{ source_id: two, origin: "recommended" }]);
		await logRequest(db, "recs", "A!", [{ source_id: two, origin: "recommended" }]); // same request re-run
		await logRequest(db, "details", "x", [{ source_id: two, origin: "lookup" }]);
		await logRequest(db, "details", "y", [{ source_id: two, origin: "list_article" }]);
		const featured = await mostFeaturedIds(db);
		expect(featured.has(star)).toBe(true);
		expect(featured.has(two)).toBe(false); // 2 separate counted requests only
	});
	it("follows an edited rule", async () => {
		const id = await book("Solo");
		await logRequest(db, "recs", "one", [{ source_id: id, origin: "recommended" }]);
		await saveRule(db, "most-featured", "Most featured", "top 100% and at least 1 separate request");
		expect((await mostFeaturedIds(db)).has(id)).toBe(true);
	});
});

describe("merge", () => {
	it("moves everything into the kept book and removes the duplicate", async () => {
		const keep = await book("The Odyssey", { library_status: "own" });
		const dup = await book("The Odyssey of Homer", { library_status: "finished", edition: { label: "Wilson", owned: true } });
		await addNote(db, dup, "great");
		await logRequest(db, "recs", "epic poems", [{ source_id: dup, origin: "recommended" }]);
		expect(await mergeSources(db, dup, keep)).toBe(true);
		const s = await getSource(db, keep);
		expect(s).toMatchObject({ library_status: "finished", appearance_count: 1 });
		expect(s!.aliases).toContain("The Odyssey of Homer");
		expect(s!.notes[0].text).toBe("great");
		expect(s!.editions[0].label).toBe("Wilson");
		expect(await getSource(db, dup)).toBeNull();
	});
});

describe("reading profile and export", () => {
	it("lists finished and on-shelf books with notes, and exports markdown", async () => {
		const a = await book("Outliers", { library_status: "finished" });
		await book("Grit", { library_status: "own" });
		await book("Recommended Only");
		await addNote(db, a, "practice compounds");
		const p = await getReadingProfile(db);
		expect(p.finished).toEqual([expect.stringContaining("Outliers")]);
		expect(p.own_not_started).toEqual([expect.stringContaining("Grit")]);
		expect(p.recent_notes_and_reviews[0]).toContain("practice compounds");
		const md = await buildMarkdownExport(db);
		expect(md).toContain("[[Book Hub]]");
		expect(md).toContain("### Outliers");
		expect(md).toContain("practice compounds");
	});
});

describe("markdown rendering", () => {
	it("renders tables and links but never raw HTML or javascript links", () => {
		const html = renderMarkdown("| A | B |\n|---|---|\n| **x** | [y](https://e.com) |\n\n<script>alert(1)</script>\n[bad](javascript:alert(1))");
		expect(html).toContain("<table>");
		expect(html).toContain('<a href="https://e.com"');
		expect(html).not.toContain("<script>");
		expect(html).not.toContain('href="javascript');
	});
});

describe("machine API", () => {
	const call = (path: string, token?: string, init: RequestInit = {}) =>
		worker.fetch(new Request(BASE + path, { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" } }));
	it("refuses without the export token", async () => {
		expect((await call("/api/export.md")).status).toBe(401);
		expect((await call("/api/export.md", "wrong")).status).toBe(401);
	});
	it("exports and accepts test results with the token", async () => {
		const res = await call("/api/export.md", env.EXPORT_TOKEN);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("# Book Hub Library Export");
		const up = await call("/api/test-runs", env.EXPORT_TOKEN, { method: "POST", body: JSON.stringify({ passed: 3, failed: 1, results: [{ name: "x", pass: true }] }) });
		expect(up.status).toBe(200);
		const cookie = (await createSessionCookie("owner", env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
		const page = await (await worker.fetch(new Request(BASE + "/tests", { headers: { Cookie: cookie } }))).text();
		expect(page).toContain("3 passed");
	});
});

describe("hub pages render", () => {
	it("every main page loads for the owner", async () => {
		const id = await book("Render Me", { library_status: "finished" });
		await saveCard(db, id, { markdown: "| A | B |\n|---|---|\n| 1 | 2 |", timeless: "too_new_promising" });
		const d = await saveDiscussion(db, { source_id: id, title: "T", body: "body" });
		const m = await saveSummary(db, id, "summary");
		const cookie = (await createSessionCookie("owner", env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
		for (const path of ["/", "/buy", "/shelf", "/shelf?status=summary", "/discover?featured=1&timeless=yes&tag=x", "/notes", "/notes?view=discussions&q=T", "/notes?view=summaries", "/requests?page=2", "/more", "/add", "/add?title=", `/book/${id}`, `/book/${id}/archive`, `/book/${id}/bought`, `/book/${id}/give`, `/discussion/${d.id}`, `/summary/${m!.id}`, "/rules", "/rules/fiction-taste", "/feedback", "/settings", "/tests", "/export.md", "/export.json"]) {
			const res = await worker.fetch(new Request(BASE + path, { headers: { Cookie: cookie } }), { redirect: "manual" });
			expect(res.status, path).toBe(200);
		}
		const bookPage = await (await worker.fetch(new Request(`${BASE}/book/${id}`, { headers: { Cookie: cookie } }))).text();
		expect(bookPage).toContain("Too new — promising");
		expect(bookPage).toContain("<table>");
	});
});
