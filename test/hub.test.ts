import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { addNote, getRules, getSource, logRequest, saveSource } from "../src/db";
import { createSessionCookie } from "../src/session";

const worker = (exports as any).default;
const BASE = "https://book-hub.example.workers.dev";
const db = env.DB;
let cookie = "";

async function get(path: string) {
	return worker.fetch(new Request(BASE + path, { headers: { Cookie: cookie } }), { redirect: "manual" });
}
async function post(path: string, fields: Record<string, string>, origin = BASE) {
	return worker.fetch(new Request(BASE + path, { method: "POST", headers: { Cookie: cookie, Origin: origin }, body: new URLSearchParams(fields) }), { redirect: "manual" });
}
async function book(title: string, extra = {}) {
	const r = await saveSource(db, { title, authors: ["Test Author " + title], confirm_new: true, ...extra });
	if (r.status === "possible_duplicates") throw new Error("unexpected");
	return r.source.id;
}

beforeEach(async () => {
	cookie = (await createSessionCookie("owner", env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
	for (const t of ["appearances", "requests", "notes", "editions", "source_ids", "source_aliases", "facts", "cards", "sources", "rules_history", "rules"]) await db.prepare(`DELETE FROM ${t}`).run();
});

describe("library", () => {
	it("My shelf shows reading first, filters by view, and old addresses redirect", async () => {
		await book("Zeta Shelf", { library_status: "own" });
		await book("Alpha Finished", { library_status: "finished" });
		await book("Mid Reading", { library_status: "reading" });
		await book("Not Mine");
		const html = await (await get("/shelf")).text();
		expect(html.indexOf("Mid Reading")).toBeLessThan(html.indexOf("Zeta Shelf"));
		expect(html.indexOf("Zeta Shelf")).toBeLessThan(html.indexOf("Alpha Finished"));
		expect(html).not.toContain("Not Mine");
		const own = await (await get("/shelf?status=own")).text();
		expect(own).toContain("Zeta Shelf");
		expect(own).not.toContain("Alpha Finished");
		expect(await (await get("/discover?q=zeta")).text()).not.toContain("Alpha Finished");
		expect((await get("/library")).headers.get("Location")).toBe("/shelf");
		expect((await get("/sources?q=x")).headers.get("Location")).toBe("/discover?q=x");
	});
});

describe("book page", () => {
	it("shows details, editions, history and Ask Claude links", async () => {
		const id = await book("The Odyssey", { edition: { label: "Emily Wilson translation", owned: true }, year: 300, year_source: "claude-memory" });
		await logRequest(db, "recs", "epic poems for beginners", [{ source_id: id, rank: 1, origin: "recommended" }]);
		const html = await (await get(`/book/${id}`)).text();
		expect(html).toContain("Emily Wilson translation");
		expect(html).toContain("c. 300 CE");
		expect(html).toContain("Claude, from memory");
		expect(html).toContain("epic poems for beginners");
		expect(html).toContain("https://claude.ai/new?q=");
	});
	it("returns 404 for a missing book", async () => {
		expect((await get("/book/99999")).status).toBe(404);
	});
	it("marks finished with an optional date", async () => {
		const id = await book("Outliers");
		expect((await post(`/book/${id}/status`, { status: "finished", finished_on: "" })).status).toBe(303);
		expect(await getSource(db, id)).toMatchObject({ library_status: "finished", finished_on: null });
		await post(`/book/${id}/status`, { status: "on_shelf" }); // v1 name still works
		await post(`/book/${id}/status`, { status: "finished", finished_on: "2025-01-15" });
		expect((await getSource(db, id))!.finished_on).toBe("2025-01-15");
	});
	it("adds and deletes notes; a note marks the book as Reading", async () => {
		const id = await book("Think Again");
		await post(`/book/${id}/notes`, { text: "Scientist vs preacher chapter was best", locator: "Ch 3" });
		const s = await getSource(db, id);
		expect(s!.notes[0]).toMatchObject({ text: "Scientist vs preacher chapter was best", locator: "Ch 3" });
		expect(s!.library_status).toBe("reading");
		await post(`/book/${id}/notes/${s!.notes[0].id}/delete`, {});
		expect((await getSource(db, id))!.notes).toHaveLength(0);
	});
	it("deletes a book and everything attached, only after confirming", async () => {
		const id = await book("Delete Me", { aliases: ["Del"], edition: { label: "x" } });
		await addNote(db, id, "n");
		await post(`/book/${id}/delete`, {});
		expect(await getSource(db, id)).not.toBeNull();
		await post(`/book/${id}/delete`, { confirm: "yes" });
		expect(await getSource(db, id)).toBeNull();
		for (const t of ["notes", "editions", "source_aliases"]) {
			expect((await db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE source_id = ?`).bind(id).first())!.n).toBe(0);
		}
	});
	it("refuses forms posted from another site", async () => {
		const id = await book("Guarded");
		expect((await post(`/book/${id}/status`, { status: "finished" }, "https://evil.example")).status).toBe(403);
		expect((await getSource(db, id))!.library_status).toBe("none");
	});
});

describe("rules pages", () => {
	it("lists rules, saves a new version, and restores an old one", async () => {
		expect(await (await get("/rules")).text()).toContain("Timeless test");
		await post("/rules/ranking", { body: "# Ranking v2\nprice never ranks" });
		let [r] = await getRules(db, ["ranking"]);
		expect(r).toMatchObject({ version: 2, title: "Ranking v2" });
		const page = await (await get("/rules/ranking?saved=1")).text();
		expect(page).toContain("<h1>Ranking v2</h1>");
		expect(page).toContain("Version 1");
		expect(page).toContain("Saved.");
		await post("/rules/ranking/restore", { version: "1" });
		[r] = await getRules(db, ["ranking"]);
		expect(r.version).toBe(3);
		expect(r.body.startsWith("# Ranking\n")).toBe(true);
	});
	it("returns 404 for an unknown rule", async () => {
		expect((await get("/rules/nope")).status).toBe(404);
	});
});
