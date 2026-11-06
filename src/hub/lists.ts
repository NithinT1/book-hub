// Home, Buy list, My shelf, Discover, and all requests.

import { Hono } from "hono";
import { getCurrency, getRules, getSetting, KINDS, listSources, recentRequests, TYPES } from "../db";
import { TASTE, tasteIsEmpty } from "../taste";
import { showPriceText } from "../currency";
import { allTags } from "../library";
import { STATUSES, toStatus, type Status } from "../status";
import { askButton, bookRow, claudeLink, esc, featureLabel, tip, layout, list, pager, TIMELESS_LABEL, TYPE_LABEL, KIND_LABEL, STATUS_LABEL, type HubEnv } from "./ui";

export const lists = new Hono<HubEnv>();

/** Latest saved new-copy price per source, shown in the user's currency (older ones were saved as price_inr). */
async function latestPrices(db: D1Database, ids: number[]) {
	if (!ids.length) return new Map<number, string>();
	const [{ results }, currency] = await Promise.all([
		db
			.prepare(
				`SELECT f.source_id, f.value, f.checked_at FROM facts f WHERE f.field IN ('price', 'price_inr') AND f.source_id IN (${ids.map(() => "?").join(",")})
				 AND f.id = (SELECT f2.id FROM facts f2 WHERE f2.source_id = f.source_id AND f2.field IN ('price', 'price_inr') ORDER BY f2.checked_at DESC, f2.id DESC LIMIT 1)`,
			)
			.bind(...ids)
			.all<{ source_id: number; value: string; checked_at: string }>(),
		getCurrency(db),
	]);
	const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
	return new Map(results.map((r) => [r.source_id, `${showPriceText(r.value, currency)} (${day(r.checked_at)})`]));
}

export const COMMANDS: [string, string][] = [
	["/book-recs", "Recommendations on a topic, a question, a URL, or “books like X”"],
	["/book-details", "Full details, ranking and buy verdict for one or more named books"],
	["/book-summary", "A 30–60 minute summary instead of the book"],
	["/book-discuss", "Go deep on a chapter, verse or idea while reading"],
	["/book-store", "At a book store: price check a book, or find gems on a rack photo"],
	["/book-shelf", "Add books from shelf photos, or decide what to give away"],
	["/book-checkin", "Monthly/quarterly: what to read next + pending actions"],
	["/book-hub-feedback", "Report a problem or change request"],
];

// ---- Home --------------------------------------------------------------------

lists.get("/", async (c) => {
	const db = c.env.DB;
	const [reading, buy, featured, requests, counts, fb] = await Promise.all([
		listSources(db, { status: "reading", sort: "recent", limit: 5 }),
		listSources(db, { status: "want_to_buy", sort: "buy", limit: 5 }),
		listSources(db, { mostFeatured: true, statuses: ["none", "want_to_buy", "own"], sort: "featured", limit: 200 }),
		recentRequests(db, 5),
		db.prepare("SELECT library_status AS s, COUNT(*) AS n FROM sources GROUP BY library_status").all<{ s: string; n: number }>(),
		db.prepare("SELECT COUNT(*) AS n FROM feedback WHERE status = 'open'").first<{ n: number }>(),
	]);
	const count = (s: string) => counts.results.find((r) => r.s === s)?.n ?? 0;
	// A one-time nudge for new hubs: shown until taste is saved or "Later" is tapped.
	const showTaste =
		!(await getSetting(db, "taste_card")) &&
		tasteIsEmpty(Object.fromEntries((await getRules(db, TASTE.map((t) => t.rule))).map((r) => [r.name, r.body])));
	const buyPrices = await latestPrices(db, buy.map((s) => s.id));
	const comingUp = featured.filter((s) => !s.hide_from_featured);

	return c.html(
		layout(c, "home", "Home", `
<form class="search" method="get" action="/discover"><input type="search" name="q" placeholder="Search books, authors, tags, one-liners" aria-label="Search"><button class="btn">Search</button></form>

${showTaste ? `<section class="store-panel"><div><strong>Tell Book Hub your taste (2 min)</strong><span class="muted">The fiction you enjoy, topics you care about, how you like to get books. It makes Fit scores and rankings yours.</span></div>
<div class="store-btns"><a class="btn" href="/taste">Set up</a><form method="post" action="/taste/later" style="margin:0"><button class="btn secondary">Later</button></form></div></section>` : ""}

<section class="panel">
  <h2>Ask AI</h2>
  <textarea id="topic" rows="2" placeholder="A topic, a question, or book names…" aria-label="Topic or book names"></textarea>
  <div class="actions">
    <a id="recs-link" class="btn" href="${esc(claudeLink("/book-recs "))}" target="_blank" rel="noopener"${tip("recs")}>Recommend books</a>
    <a id="details-link" class="btn secondary" href="${esc(claudeLink("/book-details "))}" target="_blank" rel="noopener"${tip("details")}>Book details</a>
    ${askButton("At a book store", "/book-store ", "btn secondary", "store")}
    ${askButton("Check-in", "/book-checkin", "btn secondary", "checkin")}
  </div>

</section>

<div class="stats">
  <a href="/shelf?status=reading"><strong>${count("reading")}</strong><span>Reading</span></a>
  <a href="/buy"><strong>${count("want_to_buy")}</strong><span>Buy list</span></a>
  <a href="/shelf?status=own"><strong>${count("own")}</strong><span>On shelf, not started</span></a>
  <a href="/shelf?status=finished"><strong>${count("finished")}</strong><span>Finished</span></a>
  ${fb?.n ? `<a href="/feedback"><strong>${fb.n}</strong><span>Open feedback</span></a>` : ""}
</div>

${reading.length ? `<section class="panel"><h2>Reading now</h2>${list(reading.map((s) => bookRow(s, { back: "/" })), "")}</section>` : ""}

<section class="panel"><h2>Buy list <a href="/buy">See all →</a></h2>
${list(buy.map((s) => bookRow(s, { back: "/", price: buyPrices.get(s.id) ?? null })), "Empty. Add books from Discover or any book page.")}</section>

${comingUp.length ? `<section class="panel"><h2>★ Keeps coming up — not read yet ${comingUp.length > 5 ? `<a href="/discover?featured=1">See all ${comingUp.length} →</a>` : ""}</h2>
${list(comingUp.slice(0, 5).map((s) => bookRow(s, { hideFeatured: true, back: "/" })), "")}</section>` : ""}

<section class="panel"><h2>Recent requests <a href="/requests">See all →</a></h2>
${requests.length ? `<ul class="plain">${requests.map((r) => `<li><strong>${esc(featureLabel(r.feature))}</strong> <span class="muted">· ${esc(r.last_run_at.slice(0, 10))} · ${r.sources} ${r.sources === 1 ? "source" : "sources"}</span><div class="muted clamp">${esc(r.input)}</div></li>`).join("")}</ul>` : `<p class="muted">Nothing yet.</p>`}</section>

<details class="panel"><summary><strong>Commands for Claude</strong></summary>
<div class="table-wrap"><table class="commands"><tbody>${COMMANDS.map(([cmd, what]) => `<tr><td>${cmd}</td><td>${esc(what)}</td></tr>`).join("")}</tbody></table></div>
<p class="muted">Plain words work too, e.g. “book recs: …”. Notes and reviews: add them on a book's page (the microphone key works for dictation).</p></details>

<script>
const topic = document.getElementById("topic");
const link = (id, prefix) => { document.getElementById(id).href = "https://claude.ai/new?q=" + encodeURIComponent(prefix + topic.value.trim()); };
topic.addEventListener("input", () => { link("recs-link", "/book-recs "); link("details-link", "/book-details "); });
</script>`, { h1: false }),
	);
});

// ---- Buy list ----------------------------------------------------------------

lists.get("/buy", async (c) => {
	const rows = await listSources(c.env.DB, { status: "want_to_buy", sort: "buy", limit: 500 });
	const prices = await latestPrices(c.env.DB, rows.map((r) => r.id));
	return c.html(
		layout(c, "buy", "Buy list", `
<p class="muted">Books to buy when the time is right, in your order. “Bought” moves a book to My shelf.</p>
<section class="store-panel"><div><strong>At a bookstore now?</strong><span class="muted">Snap a price tag or a whole shelf. Your AI checks it against your lists and rules.</span></div>
<div class="store-btns">${askButton("2nd-hand price check", "/book-store Second-hand price check: I'll send a photo or the name of a book and the price on it.", "btn", "priceCheck")}
${askButton("Rack gem check", "/book-store Rack gem check: I'm sending a photo of a rack — find up to 5 books worth picking.", "btn secondary", "rackCheck")}</div></section>
${list(rows.map((s) => bookRow(s, { back: "/buy", price: prices.get(s.id) ?? null, reorder: true })), "Nothing here yet. On any book in Discover, tap “Add to buy list”.")}`),
	);
});

// ---- My shelf ----------------------------------------------------------------

const SHELF_VIEWS: [string, string, Status[] | null, string?][] = [
	["all", "All", ["reading", "own", "finished", "given_away"], undefined],
	["reading", "Reading", ["reading"]],
	["own", "Not started", ["own"]],
	["finished", "Finished", ["finished"]],
	["summary", "Read via summary", ["archived"], "read_via_summary"],
	["given_away", "Given away", ["given_away"]],
];

lists.get("/shelf", async (c) => {
	const view = SHELF_VIEWS.find(([k]) => k === c.req.query("status")) ?? SHELF_VIEWS[0];
	const rows = await listSources(c.env.DB, { statuses: view[2]!, archiveReason: view[3], sort: "library", limit: 1000, includeArchived: true });
	return c.html(
		layout(c, "shelf", "My shelf", `
<nav class="segmented">${SHELF_VIEWS.map(([k, label]) => `<a href="/shelf?status=${k}"${k === view[0] ? ` aria-current="page"` : ""}>${label}</a>`).join("")}</nav>
<p class="muted">${rows.length} ${rows.length === 1 ? "book" : "books"}</p>
${list(rows.map((s) => bookRow(s, { back: `/shelf?status=${view[0]}` })), "Nothing here.")}`, {
			actions: `${askButton("Add shelf photos", "/book-shelf I'm sending photos of my bookshelf — add the books to my library.", "btn", "addShelfPhotos")}
<a class="btn secondary" href="/add"${tip("add")}>Add a book</a>
${askButton("Give-away check", "/book-shelf Give-away check: which of my books can I give away?", "btn secondary", "giveawayCheck")}`,
		}),
	);
});

// ---- Discover ----------------------------------------------------------------

const SORT_LABEL = { best: "Best first", recent: "Recently updated", featured: "Most featured", title: "Title", year: "Newest" } as const;

/** A dropdown of checkboxes — several values can be ticked. Works the same on phone and laptop. */
function multiSelect(name: string, label: string, options: [string, string][], selected: string[]) {
	const count = selected.length;
	return `<details class="multi"><summary>${esc(label)}${count ? ` <span class="count">${count}</span>` : ""}</summary><div class="multi-options">${options
		.map(([v, l]) => `<label class="choice"><input type="checkbox" name="${name}" value="${esc(v)}"${selected.includes(v) ? " checked" : ""}> ${esc(l)}</label>`)
		.join("")}</div></details>`;
}

lists.get("/discover", async (c) => {
	const url = new URL(c.req.url);
	const many = (key: string, allowed: readonly string[]) => url.searchParams.getAll(key).filter((v) => allowed.includes(v));
	const q = c.req.query("q")?.trim() || undefined;
	const statuses = url.searchParams.getAll("status").map(toStatus).filter((s): s is Status => Boolean(s));
	const types = many("type", TYPES);
	const kinds = many("kind", KINDS);
	const timeless = many("timeless", Object.keys(TIMELESS_LABEL));
	const tagValues = url.searchParams.getAll("tag").map((t) => t.trim()).filter(Boolean);
	const mostFeatured = c.req.query("featured") === "1";
	const sort = (Object.keys(SORT_LABEL) as (keyof typeof SORT_LABEL)[]).find((s) => s === c.req.query("sort")) ?? "best";
	const [rows, tags] = await Promise.all([
		listSources(c.env.DB, {
			query: q,
			statuses: statuses.length ? statuses : undefined,
			includeArchived: statuses.includes("archived"),
			types,
			kinds,
			timelessAny: timeless,
			tags: tagValues,
			mostFeatured,
			sort,
			limit: 1000,
		}),
		allTags(c.env.DB),
	]);
	const filtered = Boolean(q || statuses.length || types.length || kinds.length || timeless.length || tagValues.length || mostFeatured);
	const back = `/discover${url.search}`;

	return c.html(
		layout(c, "discover", "Discover", `
<p class="muted">Everything that has come up. Best first: books you haven't acted on, ★ keeps-coming-up and timeless ones at the top; Reading and Buy list at the end. Archived is hidden unless you tick it.</p>
<form class="filters" method="get">
  <input type="search" name="q" value="${esc(q ?? "")}" placeholder="Search title, author, tag, one-liner" aria-label="Search">
  ${multiSelect("status", "Status", STATUSES.map((s) => [s, STATUS_LABEL[s]]), statuses)}
  ${multiSelect("type", "Type", TYPES.map((t) => [t, TYPE_LABEL[t]]), types)}
  ${multiSelect("kind", "Kind", KINDS.map((k) => [k, KIND_LABEL[k]]), kinds)}
  ${multiSelect("timeless", "Timeless", Object.entries(TIMELESS_LABEL).filter(([v]) => v !== "not_applicable"), timeless)}
  ${tags.length ? multiSelect("tag", "Tags", tags.map((t) => [t.tag, `${t.tag} (${t.n})`]), tagValues) : ""}
  <select name="sort" aria-label="Sort">${Object.entries(SORT_LABEL).map(([v, l]) => `<option value="${v}"${v === sort ? " selected" : ""}>${l}</option>`).join("")}</select>
  <label class="check"><input type="checkbox" name="featured" value="1"${mostFeatured ? " checked" : ""}> ★ Most featured</label>
  <button class="btn">Apply</button>${filtered || sort !== "best" ? ` <a class="muted" href="/discover">Reset</a>` : ""}
</form>
<p class="muted">${rows.length} ${rows.length === 1 ? "result" : "results"}</p>
${list(rows.map((s) => bookRow(s, { back })), filtered ? "Nothing matches. Try clearing the filters." : "Nothing yet.")}
`),
	);
});

// ---- All requests ------------------------------------------------------------

lists.get("/requests", async (c) => {
	const pageNo = Math.max(1, Number(c.req.query("page")) || 1);
	const size = 20;
	const rows = await recentRequests(c.env.DB, size + 1, (pageNo - 1) * size);
	return c.html(
		layout(c, "home", "All requests", `
<p><a href="/">← Home</a></p>
${rows.length ? `<ul class="plain">${rows.slice(0, size).map((r) => `<li><strong>${esc(featureLabel(r.feature))}</strong> <span class="muted">· ${esc(r.last_run_at.slice(0, 10))} · ${r.sources} ${r.sources === 1 ? "source" : "sources"}</span><div class="muted">${esc(r.input)}</div></li>`).join("")}</ul>` : `<p class="empty">Nothing yet.</p>`}
${pager("/requests", pageNo, rows.length > size)}`),
	);
});

// Old v1 addresses keep working.
lists.get("/library", (c) => c.redirect("/shelf", 301));
lists.get("/sources", (c) => c.redirect(`/discover${new URL(c.req.url).search}`, 301));
lists.get("/saved", (c) => c.redirect(`/notes${new URL(c.req.url).search}`, 301));
