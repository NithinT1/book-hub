import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { convert, parsePrice, showMoney, showPriceText } from "../src/currency";
import { getCurrency, getSource, saveFacts, saveSource, setSetting } from "../src/db";
import { applyStatusEvent } from "../src/library";
import { createSessionCookie } from "../src/session";

const db = env.DB;
const worker = (exports as any).default;
const BASE = "https://book-hub.example.workers.dev";
let cookie = "";
const get = (path: string) => worker.fetch(new Request(BASE + path, { headers: { Cookie: cookie } }), { redirect: "manual" });
const post = (path: string, fields: Record<string, string>) =>
	worker.fetch(new Request(BASE + path, { method: "POST", headers: { Cookie: cookie, Origin: BASE }, body: new URLSearchParams(fields) }), { redirect: "manual" });

beforeEach(async () => {
	cookie = (await createSessionCookie("owner", env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
	for (const t of ["facts", "verdict_history", "quizzes", "sources", "settings"]) await db.prepare(`DELETE FROM ${t}`).run();
});

describe("currency (pure)", () => {
	it("reads saved price texts", () => {
		expect(parsePrice("₹455 Faber paperback")).toEqual({ amount: 455, code: "INR" });
		expect(parsePrice("$12.99")).toEqual({ amount: 12.99, code: "USD" });
		expect(parsePrice("NZ$30")).toEqual({ amount: 30, code: "NZD" });
		expect(parsePrice("INR 1,299")).toEqual({ amount: 1299, code: "INR" });
		expect(parsePrice("couldn't fetch")).toBeNull();
	});
	it("shows the user's currency as is, and converts others with ≈", () => {
		expect(showMoney(455, "INR", "INR")).toBe("₹455");
		expect(showMoney(880, "INR", "USD")).toBe("≈ $10");
		expect(showPriceText("₹455", "INR")).toBe("₹455");
		expect(showPriceText("₹880", "USD")).toBe("≈ $10 (₹880)");
		expect(Math.round(convert(10, "USD", "INR"))).toBe(880);
	});
});

describe("currency setting", () => {
	it("defaults to US dollars, and the hub can change it", async () => {
		expect(await getCurrency(db)).toBe("USD");
		expect((await post("/settings/currency", { currency: "EUR" })).status).toBe(303);
		expect(await getCurrency(db)).toBe("EUR");
		await post("/settings/currency", { currency: "XXX" });
		expect(await getCurrency(db)).toBe("EUR");
		expect(await (await get("/settings")).text()).toContain('<option value="EUR" selected>');
	});
	it("a bought price remembers its currency and shows converted after a switch", async () => {
		await setSetting(db, "currency", "INR");
		const r = await saveSource(db, { title: "Money Book", authors: ["A"], confirm_new: true, library_status: "want_to_buy" });
		if (r.status === "possible_duplicates") throw new Error("unexpected");
		await applyStatusEvent(db, r.source.id, "bought", { bought_price: 880 });
		expect((await getSource(db, r.source.id))!.bought_currency).toBe("INR");
		expect(await (await get(`/book/${r.source.id}`)).text()).toContain("₹880");
		await setSetting(db, "currency", "USD");
		expect(await (await get(`/book/${r.source.id}`)).text()).toContain("≈ $10");
	});
	it("Buy list prices: old price_inr and new price facts both show, in the user's currency", async () => {
		await setSetting(db, "currency", "USD");
		const r = await saveSource(db, { title: "Priced", authors: ["B"], confirm_new: true, library_status: "want_to_buy" });
		if (r.status === "possible_duplicates") throw new Error("unexpected");
		await saveFacts(db, r.source.id, [{ field: "price_inr", value: "₹880", link: "https://example.com" }]);
		expect(await (await get("/buy")).text()).toContain("≈ $10 (₹880)");
	});
});

describe("AI app setting", () => {
	it("defaults to Claude; choosing ChatGPT marks every page so Ask buttons open it", async () => {
		expect(await (await get("/")).text()).toContain('<body data-ai="claude">');
		expect((await post("/settings/ai-app", { ai_app: "chatgpt" })).status).toBe(303);
		const home = await (await get("/")).text();
		expect(home).toContain('<body data-ai="chatgpt">');
		expect(home).toContain("<h2>Ask AI</h2>");
		await post("/settings/ai-app", { ai_app: "nonsense" });
		expect(await (await get("/settings")).text()).toContain('value="chatgpt" checked');
	});
});

describe("your taste", () => {
	const legacyFiction = "# My fiction profile\n\nFrom an interview.\n\n## What I want fiction to do\n- **Warm** — gentle.\n\n## Avoid\n- **Dark** — bleak endings.\n\n## Other preferences\n- **Length:** any.\n\n## How to use this\n- Fixed guidance.";
	const legacyBuy = "# Buy decision\n\n- Timeless and shelf-worthy → **First-hand**.\n\nThe user prefers physical books.";
	const legacyReaders = "# Trusted readers\n\nCheck these first.\n\nAda · Grace · Linus\n\nOther prolific readers from any field are welcome.";
	const setRule = (name: string, body: string) => db.prepare("INSERT INTO rules (name, title, body) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET body = excluded.body").bind(name, name, body).run();

	it("older rules load into the form without losing a line, and saving keeps them", async () => {
		await db.prepare("DELETE FROM rules").run();
		await setRule("fiction-profile", legacyFiction);
		await setRule("buying-preferences", legacyBuy);
		await setRule("trusted-readers", legacyReaders);
		expect(await (await get("/rules/fiction-profile")).text()).toContain("Warm — gentle.");
		expect(await (await get("/rules/buying-preferences")).text()).toContain("The user prefers physical books.");
		expect(await (await get("/rules/trusted-readers")).text()).toContain("Ada · Grace · Linus");
		expect((await get("/taste")).headers.get("Location")).toBe("/rules/nonfiction-profile");
		const { SIMPLE_FORMS, readSimple, writeSimple } = await import("../src/profile");
		for (const [rule, body] of [["fiction-profile", legacyFiction], ["buying-preferences", legacyBuy], ["trusted-readers", legacyReaders]] as const) {
			const t = SIMPLE_FORMS[rule];
			const out = writeSimple(t, body, readSimple(t, body));
			for (const line of body.split("\n").map((l) => l.trim()).filter(Boolean)) expect(out, `${rule}: ${line}`).toContain(line);
			expect(writeSimple(t, out, readSimple(t, out))).toBe(out);
		}
	});
	it("saving the form writes the rules (old version kept) and the AI reads them", async () => {
		await db.prepare("DELETE FROM rules").run();
		await db.prepare("DELETE FROM rules_history").run();
		await get("/more");
		expect((await post("/rules/fiction-profile/form", { "What I want fiction to do": "- Funny and warm" })).status).toBe(303);
		await post("/rules/nonfiction-profile/form", { subjects_add: "History of science" });
		await post("/rules/buying-preferences/form", { "My preferences": "- Kindle first" });
		await post("/rules/trusted-readers/form", { "People whose picks I trust": "Ada Lovelace" });
		const body = async (n: string) => (await db.prepare("SELECT body FROM rules WHERE name = ?").bind(n).first<{ body: string }>())!.body;
		expect(await body("fiction-profile")).toMatch(/## What I want fiction to do\n- Funny and warm/);
		expect(await body("fiction-profile")).toContain("## How to use this");
		expect(await body("nonfiction-profile")).toContain("- **In:** History of science");
		expect(await body("buying-preferences")).toMatch(/## My preferences\n- Kindle first/);
		expect(await body("trusted-readers")).toContain("Ada Lovelace");
		expect((await db.prepare("SELECT COUNT(*) AS n FROM rules_history WHERE name = 'fiction-profile'").first<{ n: number }>())!.n).toBe(1);
	});
	it("Home shows the set-up card until it's done or hidden", async () => {
		await db.prepare("DELETE FROM rules").run();
		const home = await (await get("/")).text();
		expect(home).toContain("Set up Book Hub");
		expect(home).toContain("0 of 3 done");
		await setRule("fiction-profile", legacyFiction);
		expect(await (await get("/")).text()).toContain("1 of 3 done");
		await post("/setup/hide", {});
		expect(await (await get("/")).text()).not.toContain("Set up Book Hub");
	});
});

describe("Notes tab: add a note or review from here", () => {
	const add = async (title: string, library_status: string) => {
		const r = await saveSource(db, { title, authors: ["Writer " + title], confirm_new: true, library_status: library_status as any });
		if (r.status === "possible_duplicates") throw new Error("unexpected");
		return r.source.id;
	};
	it("opens on Notes with an Add a note button; Reviews has Write a review", async () => {
		const notes = await (await get("/notes")).text();
		expect(notes).toMatch(/<a href="\/notes\?view=notes" aria-current="page">Notes<\/a>/);
		expect(notes).toContain('href="/notes/pick?for=note"');
		expect(await (await get("/notes?view=reviews")).text()).toContain('href="/notes/pick?for=review"');
	});
	it("the picker lists only shelf books and opens the note box or review form", async () => {
		const reading = await add("Reading Book", "reading");
		const own = await add("Owned Book", "own");
		await add("Wanted Book", "want_to_buy");
		const notePick = await (await get("/notes/pick?for=note")).text();
		expect(notePick).toContain(`/book/${reading}?focus=note#notes`);
		expect(notePick).toContain(`/book/${own}?focus=note#notes`);
		expect(notePick).not.toContain("Wanted Book");
		const reviewPick = await (await get("/notes/pick?for=review")).text();
		expect(reviewPick).toContain(`/book/${reading}#review`);
		expect(reviewPick).not.toContain("Owned Book");
	});
	it("Profile & settings shows Kindle integration as coming soon", async () => {
		const page = await (await get("/more")).text();
		expect(page).toMatch(/<strong>Kindle<\/strong>.*<span class="tag star">Coming soon<\/span>/s);
		for (const label of ["About me as a reader", "How I judge books", "Settings", "System rules", "Non-fiction profile", "Quality: non-fiction", "Verdict", "Using starter"]) expect(page).toContain(label);
	});
});
