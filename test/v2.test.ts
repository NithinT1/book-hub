import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addNote, getSource, listSources, logRequest, mostFeaturedIds, saveCard, saveDiscussion, saveSource, saveSummary } from "../src/db";
import { applyStatusEvent, moveOnBuyList, saveReview, setStatus } from "../src/library";
import { nextStatus, STATUSES, toStatus, type Status } from "../src/status";
import { createSessionCookie } from "../src/session";

const db = env.DB;
const worker = (exports as any).default;
const BASE = "https://book-hub.example.workers.dev";
let cookie = "";

async function book(title: string, extra = {}) {
	const r = await saveSource(db, { title, authors: ["Author " + title], confirm_new: true, ...extra });
	if (r.status === "possible_duplicates") throw new Error("unexpected");
	return r.source.id;
}
const status = async (id: number) => (await getSource(db, id))!.library_status;
const post = (path: string, fields: Record<string, string>) =>
	worker.fetch(new Request(BASE + path, { method: "POST", headers: { Cookie: cookie, Origin: BASE }, body: new URLSearchParams(fields) }), { redirect: "manual" });
const get = (path: string) => worker.fetch(new Request(BASE + path, { headers: { Cookie: cookie } }), { redirect: "manual" });

beforeEach(async () => {
	cookie = (await createSessionCookie("owner", env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
	for (const t of ["appearances", "requests", "notes", "editions", "source_ids", "source_aliases", "source_tags", "facts", "cards", "verdict_history", "quizzes", "discussions", "summaries", "sources", "series", "rules_history", "rules"]) await db.prepare(`DELETE FROM ${t}`).run();
});

describe("status rules (pure)", () => {
	const cases: [Status, Parameters<typeof nextStatus>[1], Status | null][] = [
		["none", "add_to_buy_list", "want_to_buy"],
		["want_to_buy", "bought", "own"],
		["none", "note_added", "reading"],
		["want_to_buy", "note_added", "reading"],
		["own", "discussed", "reading"],
		["reading", "reviewed", "finished"],
		["finished", "note_added", null], // a note never un-finishes a book
		["finished", "bought", null], // buying a copy of a finished book keeps it finished
		["reading", "add_to_buy_list", null],
		["none", "given_away", null], // can't give away what you don't own
		["finished", "given_away", "given_away"],
		["archived", "add_to_buy_list", "want_to_buy"],
	];
	for (const [from, event, to] of cases) it(`${from} + ${event} → ${to ?? "no change"}`, () => expect(nextStatus(from, event)).toBe(to));
	it("accepts v1 names", () => {
		expect(toStatus("on_shelf")).toBe("own");
		expect(toStatus("nonsense")).toBeUndefined();
		expect(STATUSES).toHaveLength(8);
	});
});

describe("actions move statuses", () => {
	it("note → reading; discussion → reading; summary → no change; review → finished", async () => {
		const a = await book("A");
		await addNote(db, a, "x");
		expect(await status(a)).toBe("reading");
		const b = await book("B");
		await saveDiscussion(db, { source_id: b, title: "t", body: "b" });
		expect(await status(b)).toBe("reading");
		const c = await book("C", { library_status: "want_to_buy" });
		await saveSummary(db, c, "s");
		expect(await status(c)).toBe("want_to_buy");
		await saveReview(db, a, { rating: 8, reread: "yes", body: "great" });
		expect(await getSource(db, a)).toMatchObject({ library_status: "finished", rating: 8, reread: "yes", review: { text: "great" } });
	});
	it("a mid-book rating keeps it reading; a second review replaces the first", async () => {
		const id = await book("Mid", { library_status: "reading" });
		await saveReview(db, id, { rating: 6, body: "so far", finished: false });
		expect(await status(id)).toBe("reading");
		await saveReview(db, id, { rating: 9, body: "final" });
		const s = await getSource(db, id);
		expect(s).toMatchObject({ library_status: "finished", rating: 9, review: { text: "final" } });
		expect((await db.prepare("SELECT COUNT(*) AS n FROM notes WHERE source_id = ? AND kind = 'review'").bind(id).first())!.n).toBe(1);
	});
	it("bought records format, price and owned format", async () => {
		const id = await book("Buy Me", { library_status: "want_to_buy" });
		await applyStatusEvent(db, id, "bought", { bought_format: "second_hand", bought_price: 250 });
		expect(await getSource(db, id)).toMatchObject({ library_status: "own", bought_format: "second_hand", bought_price: 250, owned_format: "physical", buy_rank: null });
	});
});

describe("buy list", () => {
	it("adds at the bottom, moves up and down, and closes gaps", async () => {
		const [a, b, c] = [await book("One"), await book("Two"), await book("Three")];
		for (const id of [a, b, c]) await applyStatusEvent(db, id, "add_to_buy_list");
		const order = async () => (await listSources(db, { status: "want_to_buy", sort: "buy" })).map((s) => s.title);
		expect(await order()).toEqual(["One", "Two", "Three"]);
		await moveOnBuyList(db, c, "up");
		expect(await order()).toEqual(["One", "Three", "Two"]);
		await moveOnBuyList(db, a, "up"); // already top: no change
		await applyStatusEvent(db, b, "bought");
		expect(await order()).toEqual(["One", "Three"]);
		const d = await book("Four");
		await applyStatusEvent(db, d, "add_to_buy_list");
		expect(await order()).toEqual(["One", "Three", "Four"]);
	});
});

describe("archive", () => {
	it("hides from Discover unless asked; 'read via summary' shows on My shelf", async () => {
		const junk = await book("Junk");
		const sum = await book("Summarised");
		await setStatus(db, junk, "archived", { archive_reason: "not_useful" });
		await setStatus(db, sum, "archived", { archive_reason: "read_via_summary" });
		expect((await listSources(db)).map((s) => s.title)).toEqual([]);
		expect((await listSources(db, { status: "archived" })).length).toBe(2);
		expect((await listSources(db, { statuses: ["archived"], archiveReason: "read_via_summary", includeArchived: true })).map((s) => s.title)).toEqual(["Summarised"]);
		await setStatus(db, junk, "none");
		expect(await getSource(db, junk)).toMatchObject({ library_status: "none", archive_reason: null });
	});
});

describe("tags, one-liners, series", () => {
	it("tags are normalised and added (never removed by Claude); one-liner can be updated", async () => {
		const id = await book("Tagged", { tags: ["Feel-Good", "fiction"], one_liner: "old" });
		await saveSource(db, { title: "Tagged", authors: ["Author Tagged"], tags: ["cosy"], one_liner: "A gentle story about a café." });
		const s = await getSource(db, id);
		expect(s!.tags).toEqual(["cosy", "feel-good", "fiction"]);
		expect(s!.one_liner).toBe("A gentle story about a café.");
		expect((await listSources(db, { tag: "feel-good" })).map((x) => x.id)).toEqual([id]);
	});
	it("series lists other books by name only — they don't become sources", async () => {
		const id = await book("The Fellowship of the Ring", {
			authors: ["J. R. R. Tolkien"],
			series: { name: "The Lord of the Rings", position: 1, books: [{ position: 1, title: "The Fellowship of the Ring" }, { position: 2, title: "The Two Towers" }, { position: 3, title: "The Return of the King" }] },
		});
		const s = await getSource(db, id);
		expect(s!.series!.books.map((b) => b.title)).toEqual(["The Fellowship of the Ring", "The Two Towers", "The Return of the King"]);
		expect(s!.series!.books[0].source_id).toBe(id);
		expect((await listSources(db)).length).toBe(1);
	});
});

describe("featured counts", () => {
	it("check-in and store picks don't count toward featured or ★", async () => {
		const id = await book("Picked");
		for (const q of ["a", "b", "c"]) await logRequest(db, "checkin", q, [{ source_id: id, origin: "checkin" }]);
		await logRequest(db, "store", "rack", [{ source_id: id, origin: "store" }]);
		expect((await getSource(db, id))!.appearance_count).toBe(0);
		expect((await mostFeaturedIds(db)).has(id)).toBe(false);
	});
});

describe("hub flows", () => {
	it("Buy list → Bought (2nd-hand, price) → My shelf", async () => {
		const id = await book("Klara and the Sun");
		await post(`/book/${id}/buy`, {});
		expect(await status(id)).toBe("want_to_buy");
		expect(await (await get("/buy")).text()).toContain("Klara and the Sun");
		await post(`/book/${id}/bought`, { format: "second_hand", price: "₹ 250", back: "/buy" });
		expect(await getSource(db, id)).toMatchObject({ library_status: "own", bought_format: "second_hand", bought_price: 250 });
		expect(await (await get("/shelf?status=own")).text()).toContain("Klara and the Sun");
	});
	it("archive needs the confirmation form; reason is saved", async () => {
		const id = await book("Clutter");
		expect(await (await get(`/book/${id}/archive?back=/discover`)).text()).toContain("Yes, archive");
		const res = await post(`/book/${id}/archive`, { reason: "not_useful", back: "/discover" });
		expect(res.headers.get("Location")).toBe("/discover");
		expect(await getSource(db, id)).toMatchObject({ library_status: "archived", archive_reason: "not_useful" });
	});
	it("refuses open redirects in back links", async () => {
		const id = await book("Safe");
		const res = await post(`/book/${id}/archive`, { reason: "not_useful", back: "https://evil.example" });
		expect(res.headers.get("Location")).toBe("/discover");
	});
	it("give away records price; Kindle books can't be given away", async () => {
		const id = await book("Old Book", { library_status: "finished" });
		await post(`/book/${id}/give`, { price: "150" });
		expect(await getSource(db, id)).toMatchObject({ library_status: "given_away", given_price: 150 });
		const k = await book("Kindle Book", { library_status: "own" });
		await db.prepare("UPDATE sources SET owned_format = 'kindle' WHERE id = ?").bind(k).run();
		expect(await (await get(`/book/${k}/give`)).text()).toContain("can't be given away");
	});
	it("review form saves rating, re-read and template; hide from 'keeps coming up'", async () => {
		const id = await book("Coffee Gets Cold", { library_status: "reading" });
		await post(`/book/${id}/review`, { rating: "8", reread: "maybe", body: "## One-line verdict\nWarm.", finished: "1" });
		expect(await getSource(db, id)).toMatchObject({ library_status: "finished", rating: 8, reread: "maybe" });
		await post(`/book/${id}/hide-featured`, { back: "/" });
		expect((await getSource(db, id))!.hide_from_featured).toBe(1);
	});
	it("Add a book without Claude", async () => {
		const res = await post("/add", { title: "The Alchemist", author: "Paulo Coelho", status: "want_to_buy" });
		const id = Number(res.headers.get("Location")!.split("/").pop());
		expect(await getSource(db, id)).toMatchObject({ title: "The Alchemist", library_status: "want_to_buy", buy_rank: 1 });
		const again = await post("/add", { title: "The Alchemist", author: "Paulo Coelho", status: "own" });
		expect(again.headers.get("Location")).toBe(`/book/${id}`); // matched, not duplicated
		expect(await status(id)).toBe("own");
	});
	it("book page shows status actions and covers only for owned books", async () => {
		const notOwned = await book("Cover Test", { cover_url: "https://covers.openlibrary.org/b/id/1-M.jpg" });
		expect(await (await get(`/book/${notOwned}`)).text()).not.toContain("covers.openlibrary.org");
		await setStatus(db, notOwned, "own");
		const html = await (await get(`/book/${notOwned}`)).text();
		expect(html).toContain("covers.openlibrary.org");
		expect(html).toContain("Give away");
	});
});

describe("action explanations", () => {
	it("actions have hover tooltips; no 'What do these do?' accordions", async () => {
		const home = await (await get("/")).text();
		expect(home).toContain('title="Opens your AI app with /book-recs');
		expect(home).not.toContain("What do these do?");
		expect(home).not.toContain("Add a book yourself");
	});
});

describe("card readability", () => {
	it("one-line-per-field cards get a paragraph and bold label per field; tidy cards are unchanged", async () => {
		const { cardMarkdown } = await import("../src/hub/book");
		const flat = "**A Book — Someone (2016). Fit 7/10.**\nCore idea: a count in a hotel.\nRatings: Goodreads 4.3 (1,000).\n- a list item\n- another";
		expect(cardMarkdown(flat)).toBe("**A Book — Someone (2016). Fit 7/10.**\n\n**Core idea:** a count in a hotel.\n\n**Ratings:** Goodreads 4.3 (1,000).\n- a list item\n- another");
		const tidy = "**Title**\n\n**In one line:** x\n\n**Fit: 6/10.** y";
		expect(cardMarkdown(tidy)).toBe(tidy);
	});
});

describe("page headers", () => {
	it("Buy list and My shelf put their actions next to the title, one primary", async () => {
		const buy = await (await get("/buy")).text();
		expect(buy).toMatch(/<section class="store-panel">[\s\S]*At a bookstore now\?[\s\S]*class="btn"[^>]*>2nd-hand price check[\s\S]*class="btn secondary"[^>]*>Rack gem check/);
		const shelf = await (await get("/shelf")).text();
		expect(shelf).toMatch(/<div class="page-head"><h1>My shelf<\/h1><div class="page-actions">[\s\S]*Add shelf photos[\s\S]*Add a book[\s\S]*Give-away check/);
		const head = shelf.slice(shelf.indexOf('class="page-actions"'), shelf.indexOf("</div>", shelf.indexOf('class="page-actions"')));
		expect(head.match(/class="btn"/g)?.length).toBe(1);
	});
});

describe("row actions follow the book's status", () => {
	const rowOf = (html: string, title: string) => {
		const start = html.lastIndexOf("<li", html.indexOf(`${title}</strong>`));
		return html.slice(start, html.indexOf("</li>", start));
	};
	it("reading books get Discuss, Note and Finish & review — on Home and My shelf alike", async () => {
		await book("House in the Cerulean Sea", { library_status: "reading", type: "fiction", tags: ["fiction", "feel-good"] });
		for (const path of ["/", "/shelf?status=reading"]) {
			const row = rowOf(await (await get(path)).text(), "House in the Cerulean Sea");
			expect(row, path).toContain("Discuss");
			expect(row, path).toContain("?focus=note#notes");
			expect(row, path).toContain(">Finish &amp; review<");
			expect(row, path).toContain("feel-good");
			expect(row.match(/>Fiction</g)?.length, `${path} duplicate type tag`).toBe(1);
		}
	});
	it("Buy list books have the same actions on Home and the Buy list; Summary becomes Read summary", async () => {
		const id = await book("Klara and the Sun", { library_status: "want_to_buy" });
		for (const path of ["/", "/buy"]) {
			const row = rowOf(await (await get(path)).text(), "Klara and the Sun");
			for (const a of ["Summary", "Bought", "Archive"]) expect(row, `${path} ${a}`).toContain(a);
			expect(row).not.toContain("Give away");
			// Reorder only on the Buy list, in its own column before the book — never among the actions.
			const actions = row.slice(row.indexOf('class="row-actions"'));
			expect(actions, path).not.toContain("Move up");
			if (path === "/buy") expect(row.indexOf("Move up"), path).toBeLessThan(row.indexOf('class="row"'));
			else expect(row, path).not.toContain("Move up");
		}
		const m = await saveSummary(db, id, "summary text");
		const row = rowOf(await (await get("/buy")).text(), "Klara and the Sun");
		expect(row).toContain(`/summary/${m!.id}`);
		expect(row).toContain("Read summary");
		const buyPage = await (await get("/buy")).text();
		expect(buyPage).toContain("At a bookstore now?");
		expect(buyPage).toContain("2nd-hand price check");
		expect(buyPage).toContain("Rack gem check");
	});
	it("Discover: Buy list + Details only when no card; adding returns to the same page", async () => {
		const id = await book("Fresh Pick");
		let row = rowOf(await (await get("/discover")).text(), "Fresh Pick");
		expect(row).toContain("Details");
		expect(row).toContain("Summary");
		await saveCard(db, id, { markdown: "card" });
		row = rowOf(await (await get("/discover")).text(), "Fresh Pick");
		expect(row).not.toContain(">Details<");
		const res = await post(`/book/${id}/buy`, { back: "/discover" });
		expect(res.headers.get("Location")).toBe("/discover");
		expect(await status(id)).toBe("want_to_buy");
	});
	it("finished books offer Review, then Edit review once written", async () => {
		const id = await book("Done Book", { library_status: "finished" });
		expect(rowOf(await (await get("/shelf?status=finished")).text(), "Done Book")).toContain(">Review<");
		await saveReview(db, id, { body: "x", rating: 7 });
		expect(rowOf(await (await get("/shelf?status=finished")).text(), "Done Book")).toContain("Edit review");
	});
});

describe("Discover filters and default order", () => {
	it("Best first: undecided first (★ then timeless), Reading and Buy list last", async () => {
		const plain = await book("Plain Pick");
		const timeless = await book("Timeless Pick");
		await saveCard(db, timeless, { markdown: "c", timeless: "yes" });
		const star = await book("Star Pick");
		for (const q of ["a", "b", "c"]) await logRequest(db, "recs", q, [{ source_id: star, origin: "recommended" }]);
		await book("Buying Pick", { library_status: "want_to_buy" });
		await book("Reading Pick", { library_status: "reading" });
		const html = await (await get("/discover")).text();
		const order = ["Star Pick", "Timeless Pick", "Plain Pick", "Reading Pick", "Buying Pick"].map((t) => html.indexOf(`${t}</strong>`));
		expect(order.every((pos, i) => pos > 0 && (i === 0 || pos > order[i - 1]))).toBe(true);
		void plain;
	});
	it("ticking several values in one filter shows any of them", async () => {
		await book("Fic One", { type: "fiction", tags: ["thriller"] });
		await book("Bio One", { type: "biography", tags: ["memoir"] });
		await book("Non One", { type: "nonfiction", tags: ["habits"] });
		const both = await (await get("/discover?type=fiction&type=biography")).text();
		expect(both).toContain("Fic One</strong>");
		expect(both).toContain("Bio One</strong>");
		expect(both).not.toContain("Non One</strong>");
		const byTags = await (await get("/discover?tag=thriller&tag=habits")).text();
		expect(byTags).toContain("Fic One</strong>");
		expect(byTags).toContain("Non One</strong>");
		expect(byTags).not.toContain("Bio One</strong>");
		expect(both).toContain('<span class="count">2</span>');
	});
	it("archived appears only when ticked", async () => {
		const id = await book("Gone Pick");
		await setStatus(db, id, "archived", { archive_reason: "not_useful" });
		expect(await (await get("/discover")).text()).not.toContain("Gone Pick</strong>");
		expect(await (await get("/discover?status=archived&status=none")).text()).toContain("Gone Pick</strong>");
	});
});

describe("row action styling", () => {
	it("the main next step is a filled button, and fiction doesn't show a second 'Fiction' chip", async () => {
		const id = await book("Moscow", { library_status: "reading", type: "fiction" });
		await saveCard(db, id, { markdown: "c", timeless: "not_applicable" });
		const html = await (await get("/shelf?status=reading")).text();
		const row = html.slice(html.indexOf("Moscow</strong>"), html.indexOf("</li>", html.indexOf("Moscow</strong>")));
		expect(row).toMatch(/class="act primary"[^>]*>.*Discuss/s);
		expect(row.match(/>Fiction</g)?.length).toBe(1);
	});
});

describe("valid list markup", () => {
	it("no link is nested inside a row's link (it breaks the phone layout)", async () => {
		await book("Tagged Reading", { library_status: "reading", tags: ["feel-good", "humour"] });
		for (const path of ["/", "/shelf", "/discover", "/buy"]) {
			const html = await (await get(path)).text();
			for (const row of html.match(/<a class="row"[\s\S]*?<\/a>/g) ?? []) expect(row.slice(1), path).not.toMatch(/<a[\s>]/);
		}
	});
});

describe("My shelf order and rows", () => {
	it("Reading → Not started → Finished (review pending) → Finished (reviewed); no Give away on rows", async () => {
		const reviewed = await book("Reviewed Done", { library_status: "finished" });
		await saveReview(db, reviewed, { body: "done", rating: 8 });
		await book("Pending Done", { library_status: "finished" });
		await book("Not Started", { library_status: "own" });
		await book("Now Reading", { library_status: "reading" });
		const html = await (await get("/shelf")).text();
		const pos = ["Now Reading", "Not Started", "Pending Done", "Reviewed Done"].map((t) => html.indexOf(`${t}</strong>`));
		expect(pos.every((p, i) => p > 0 && (i === 0 || p > pos[i - 1]))).toBe(true);
		expect(html).not.toMatch(/class="act[^"]*"[^>]*>[\s\S]{0,400}?Give away/);
	});
	it("'Keeps coming up' has a small ✕ in the tile's corner, not a button in the actions", async () => {
		const id = await book("Popular");
		for (const q of ["a", "b", "c"]) await logRequest(db, "recs", q, [{ source_id: id, origin: "recommended" }]);
		const home = await (await get("/")).text();
		const tile = home.slice(home.lastIndexOf('<li class="book', home.indexOf("Popular</strong>")), home.indexOf("</li>", home.indexOf("Popular</strong>")));
		expect(tile).toContain('class="book dismissable"');
		expect(tile).toMatch(/<form method="post" action="\/book\/\d+\/hide-featured" class="dismiss">/);
		expect(tile.slice(tile.indexOf('class="row-actions"'))).not.toContain("hide-featured");
	});
});

describe("review form and book page consistency", () => {
	it("review sections save as one markdown review and reopen into the same fields", async () => {
		const { reviewFromMarkdown, reviewToMarkdown } = await import("../src/library");
		const md = reviewToMarkdown({ verdict: "Warm and wise.", flaws: "Slow middle.", who: "" });
		expect(md).toBe("## One-line verdict\nWarm and wise.\n\n## What I didn't like / what challenged me / flaws\nSlow middle.");
		expect(reviewFromMarkdown(md)).toEqual({ verdict: "Warm and wise.", flaws: "Slow middle." });
		const id = await book("Sectioned", { library_status: "reading" });
		await post(`/book/${id}/review`, { rating: "8", r_verdict: "Lovely.", r_takeaways: "Small joys matter.", finished: "1" });
		const s = await getSource(db, id);
		expect(s).toMatchObject({ library_status: "finished", rating: 8 });
		expect(s!.review!.text).toContain("## What I took away\nSmall joys matter.");
		const edit = await (await get(`/book/${id}?edit_review=1`)).text();
		expect(edit).toContain('name="r_verdict" value="Lovely."');
		const notesPage = await (await get("/notes?view=reviews")).text();
		expect(notesPage).toContain("Lovely.");
		expect(notesPage).not.toContain("## One-line verdict");
	});
	it("book page: one title, the same main actions as its row, rarer ones in a quiet line", async () => {
		const id = await book("Consistent", { library_status: "reading" });
		const html = await (await get(`/book/${id}`)).text();
		expect(html.match(/<h1>/g)?.length).toBe(1);
		const actions = html.slice(html.indexOf('class="panel book-actions"'), html.indexOf("</section>", html.indexOf('class="panel book-actions"')));
		expect(actions).toMatch(/class="act primary"[^>]*>Add a note</);
		expect(actions).toContain(">Discuss<");
		expect(actions).toContain(">Add a note<");
		expect(actions).toContain(">Finish &amp; review<");
		expect(actions).not.toContain("more-menu");
		expect(actions).toMatch(/class="more-actions"[\s\S]*Give away[\s\S]*Archive/);
		expect(html).not.toContain("<h2>Ask Claude</h2>");
	});
});

describe("navigation", () => {
	it("tabs run Discover · Buy list · Home · My shelf · Notes; Profile & settings sits behind the ☰ menu", async () => {
		const html = await (await get("/")).text();
		const nav = html.slice(html.indexOf('<nav class="tabs">'), html.indexOf("</nav>"));
		const order = ["Discover", "Buy list", "Home", "My shelf", "Notes"].map((t) => nav.indexOf(`<span>${t}</span>`));
		expect(order.every((p, i) => p > 0 && (i === 0 || p > order[i - 1]))).toBe(true);
		expect(nav).not.toContain("<span>More</span>");
		expect(html).toContain('class="menu-button" href="/more"');
		expect(await (await get("/more")).text()).toContain("<h1>Profile &amp; settings</h1>");
	});
});

describe("series linking", () => {
	it("links a series book that's already in the hub, without adding missing ones", async () => {
		const sequel = await book("The Two Towers", { authors: ["J. R. R. Tolkien"] });
		const first = await book("The Fellowship of the Ring", {
			authors: ["J. R. R. Tolkien"],
			series: { name: "The Lord of the Rings", position: 1, books: [{ position: 2, title: "The Two Towers" }, { position: 3, title: "The Return of the King" }] },
		});
		const s = await getSource(db, first);
		expect(s!.series!.books.find((b) => b.position === 2)?.source_id).toBe(sequel);
		expect(s!.series!.books.find((b) => b.position === 3)?.source_id).toBeUndefined();
		expect((await listSources(db)).length).toBe(2);
	});
});
