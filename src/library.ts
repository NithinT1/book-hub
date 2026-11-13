// Library actions: statuses (via the rules in status.ts), Buy list, reviews, tags and series.
// Used by both the connector tools and the hub, so the two always behave the same.

import { authorKey, normalize, titleKey } from "./matching";
import { nextStatus, toStatus, type ArchiveReason, type BuyFormat, type Status, type StatusEvent } from "./status";

export type StatusDetails = {
	finished_on?: string;
	archive_reason?: ArchiveReason;
	buy_format?: BuyFormat;
	bought_format?: BuyFormat;
	bought_price?: number;
	owned_format?: "physical" | "kindle" | "both";
	given_price?: number;
	date?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const EVENT_FOR: Partial<Record<Status, StatusEvent>> = {
	want_to_buy: "add_to_buy_list",
	own: "catalogued",
	reading: "note_added",
	finished: "finished",
	archived: "archived",
	given_away: "given_away",
};
export const eventForStatus = (s: Status | undefined) => (s ? (EVENT_FOR[s] ?? null) : null);

/** Apply an action's automatic status change (forward-only). Returns what happened. */
export async function applyStatusEvent(db: D1Database, id: number, event: StatusEvent | null, details: StatusDetails = {}) {
	if (!event) return { changed: false as const };
	const row = await db.prepare("SELECT library_status FROM sources WHERE id = ?").bind(id).first<{ library_status: Status }>();
	if (!row) return { changed: false as const };
	const to = nextStatus(row.library_status, event);
	if (!to) {
		// No status change, but still record purchase details on an owned book ("bought the Kindle too").
		if (event === "bought" && (details.bought_format || details.bought_price != null)) await recordPurchase(db, id, details);
		return { changed: false as const, status: row.library_status };
	}
	await writeStatus(db, id, row.library_status, to, details, event);
	return { changed: true as const, from: row.library_status, status: to };
}

/** Set a status by hand (hub). Any status is allowed. */
export async function setStatus(db: D1Database, id: number, status: Status | string, details: StatusDetails | string = {}) {
	const target = toStatus(status);
	// v1 signature: setLibraryStatus(db, id, status, finishedOn?)
	const d: StatusDetails = typeof details === "string" ? { finished_on: details } : details;
	const row = await db.prepare("SELECT library_status FROM sources WHERE id = ?").bind(id).first<{ library_status: Status }>();
	if (!row || !target) return false;
	await writeStatus(db, id, row.library_status, target, d, null);
	return true;
}

async function writeStatus(db: D1Database, id: number, from: Status, to: Status, d: StatusDetails, event: StatusEvent | null) {
	const sets = ["library_status = ?", "status_changed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')", "updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')"];
	const vals: unknown[] = [to];
	const set = (col: string, v: unknown) => (sets.push(`${col} = ?`), vals.push(v));

	if (from === "want_to_buy" && to !== "want_to_buy") set("buy_rank", null);
	if (!PINNABLE.includes(to)) set("pin_rank", null); // finished, given away, archived…: no longer a current focus
	if (to === "want_to_buy") {
		const max = await db.prepare("SELECT COALESCE(MAX(buy_rank), 0) AS m FROM sources WHERE library_status = 'want_to_buy'").first<{ m: number }>();
		set("buy_rank", (max?.m ?? 0) + 1);
		if (d.buy_format) set("buy_format", d.buy_format);
	}
	if (to === "own" || to === "reading") {
		if (event === "bought" || d.bought_format || d.bought_price != null) {
			set("bought_on", d.date ?? today());
			if (d.bought_format) set("bought_format", d.bought_format);
			if (d.bought_price != null) {
				set("bought_price", d.bought_price);
				sets.push(`bought_currency = ${CURRENCY_NOW}`); // prices are entered in the user's currency
			}
		}
		sets.push(`owned_format = COALESCE(owned_format, ?)`);
		vals.push(d.owned_format ?? (d.bought_format === "kindle" ? "kindle" : "physical"));
	}
	if (to === "finished" && d.finished_on) set("finished_on", d.finished_on);
	if (to !== "finished" && from === "finished") set("finished_on", null);
	if (to === "archived") {
		set("archive_reason", d.archive_reason ?? null);
		set("archived_on", today());
	} else if (from === "archived") {
		set("archive_reason", null);
		set("archived_on", null);
	}
	if (to === "given_away") {
		set("given_on", d.date ?? today());
		if (d.given_price != null) {
			set("given_price", d.given_price);
			sets.push(`given_currency = ${CURRENCY_NOW}`);
		}
	}
	await db.prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();
	if (!PINNABLE.includes(to)) await renumberPins(db);
}

const CURRENCY_NOW = "COALESCE((SELECT value FROM settings WHERE key = 'currency'), 'USD')";

async function recordPurchase(db: D1Database, id: number, d: StatusDetails) {
	await db
		.prepare(`UPDATE sources SET bought_on = COALESCE(bought_on, ?), bought_format = COALESCE(?, bought_format), bought_price = COALESCE(?, bought_price), bought_currency = CASE WHEN ? IS NULL THEN bought_currency ELSE ${CURRENCY_NOW} END, owned_format = CASE WHEN ? = 'kindle' AND owned_format = 'physical' THEN 'both' ELSE COALESCE(owned_format, ?) END WHERE id = ?`)
		.bind(d.date ?? today(), d.bought_format ?? null, d.bought_price ?? null, d.bought_price ?? null, d.bought_format ?? null, d.bought_format === "kindle" ? "kindle" : "physical", id)
		.run();
}

// ---- Buy list ----------------------------------------------------------------

/** Move a book one place up or down the Buy list. */
export async function moveOnBuyList(db: D1Database, id: number, direction: "up" | "down") {
	const { results } = await db
		.prepare("SELECT id FROM sources WHERE library_status = 'want_to_buy' ORDER BY buy_rank IS NULL, buy_rank, id")
		.all<{ id: number }>();
	const order = results.map((r) => r.id);
	const i = order.indexOf(id);
	const j = direction === "up" ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= order.length) return false;
	[order[i], order[j]] = [order[j], order[i]];
	await db.batch(order.map((sid, k) => db.prepare("UPDATE sources SET buy_rank = ? WHERE id = ?").bind(k + 1, sid)));
	return true;
}

// ---- Pins on My shelf ----------------------------------------------------------

export const MAX_PINS = 5;
export const PINNABLE: string[] = ["own", "reading"];

async function pinOrder(db: D1Database) {
	const { results } = await db.prepare("SELECT id FROM sources WHERE pin_rank IS NOT NULL ORDER BY pin_rank, id").all<{ id: number }>();
	return results.map((r) => r.id);
}

async function renumberPins(db: D1Database, order?: number[]) {
	const ids = order ?? (await pinOrder(db));
	if (ids.length) await db.batch(ids.map((sid, k) => db.prepare("UPDATE sources SET pin_rank = ? WHERE id = ?").bind(k + 1, sid)));
}

/** Pin a shelf book (Reading or Not started) at the end of the pins. Refuses when 5 are pinned already. */
export async function pinBook(db: D1Database, id: number): Promise<"pinned" | "already" | "full" | "not_on_shelf"> {
	const s = await db.prepare("SELECT library_status, pin_rank FROM sources WHERE id = ?").bind(id).first<{ library_status: string; pin_rank: number | null }>();
	if (!s || !PINNABLE.includes(s.library_status)) return "not_on_shelf";
	if (s.pin_rank != null) return "already";
	const order = await pinOrder(db);
	if (order.length >= MAX_PINS) return "full";
	await db.prepare("UPDATE sources SET pin_rank = ? WHERE id = ?").bind(order.length + 1, id).run();
	return "pinned";
}

export async function unpinBook(db: D1Database, id: number) {
	await db.prepare("UPDATE sources SET pin_rank = NULL WHERE id = ?").bind(id).run();
	await renumberPins(db);
}

/** Move a pin one place up or down. */
export async function movePin(db: D1Database, id: number, direction: "up" | "down") {
	const order = await pinOrder(db);
	const i = order.indexOf(id);
	const j = direction === "up" ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= order.length) return false;
	[order[i], order[j]] = [order[j], order[i]];
	await renumberPins(db, order);
	return true;
}

// ---- Reviews and ratings -----------------------------------------------------

export type ReviewInput = { rating?: number; reread?: "yes" | "maybe" | "no"; body: string; finished_on?: string; finished?: boolean };

/** Saves (or replaces) the book's review. Finishing is the user's choice: a review written mid-book keeps it "Reading". */
export async function saveReview(db: D1Database, id: number, r: ReviewInput) {
	const existing = await db.prepare("SELECT id FROM notes WHERE source_id = ? AND kind = 'review'").bind(id).first<{ id: number }>();
	const stmts = [
		existing
			? db.prepare("UPDATE notes SET text = ?, created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(r.body, existing.id)
			: db.prepare("INSERT INTO notes (source_id, text, kind) VALUES (?, ?, 'review')").bind(id, r.body),
	];
	if (r.rating != null) stmts.push(db.prepare("UPDATE sources SET rating = ? WHERE id = ?").bind(Math.max(0, Math.min(10, Math.round(r.rating))), id));
	if (r.reread) stmts.push(db.prepare("UPDATE sources SET reread = ? WHERE id = ?").bind(r.reread, id));
	await db.batch(stmts);
	await applyStatusEvent(db, id, r.finished === false ? "rated" : "reviewed", { finished_on: r.finished_on });
}

/** The review template's sections. Stored together as markdown ("## Heading" + text) so Claude and the export read it. */
export const REVIEW_SECTIONS = [
	["verdict", "One-line verdict"],
	["takeaways", "What I took away"],
	["flaws", "What I didn't like / what challenged me / flaws"],
	["favourites", "Favourite ideas or quotes"],
	["who", "Who should read it"],
	["changed", "Did it change my mind on anything?"],
] as const;
export type ReviewSectionKey = (typeof REVIEW_SECTIONS)[number][0];

export function reviewToMarkdown(fields: Partial<Record<ReviewSectionKey, string>>) {
	return REVIEW_SECTIONS.filter(([k]) => fields[k]?.trim())
		.map(([k, heading]) => `## ${heading}\n${fields[k]!.trim()}`)
		.join("\n\n");
}

/** Splits a stored review back into its sections. Text before any known heading goes into the verdict. */
export function reviewFromMarkdown(md: string | undefined | null): Partial<Record<ReviewSectionKey, string>> {
	const out: Partial<Record<ReviewSectionKey, string>> = {};
	if (!md) return out;
	let current: ReviewSectionKey = "verdict";
	const buf: Record<string, string[]> = {};
	for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
		const h = line.match(/^#{1,4}\s+(.*)$/);
		const match = h && REVIEW_SECTIONS.find(([, heading]) => heading.toLowerCase().startsWith(h[1].trim().toLowerCase().slice(0, 12)));
		if (match) current = match[0];
		else (buf[current] ??= []).push(line);
	}
	for (const [k, lines] of Object.entries(buf)) {
		const text = lines.join("\n").trim();
		if (text) out[k as ReviewSectionKey] = text;
	}
	return out;
}

// ---- Tags --------------------------------------------------------------------

export const normalizeTag = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);

export async function saveTags(db: D1Database, id: number, tags: string[]) {
	const clean = [...new Set(tags.map(normalizeTag).filter(Boolean))].slice(0, 8);
	if (clean.length) await db.batch(clean.map((t) => db.prepare("INSERT OR IGNORE INTO source_tags (source_id, tag) VALUES (?, ?)").bind(id, t)));
}

export async function removeTag(db: D1Database, id: number, tag: string) {
	await db.prepare("DELETE FROM source_tags WHERE source_id = ? AND tag = ?").bind(id, normalizeTag(tag)).run();
}

export async function allTags(db: D1Database) {
	const { results } = await db.prepare("SELECT tag, COUNT(*) AS n FROM source_tags GROUP BY tag ORDER BY n DESC, tag").all<{ tag: string; n: number }>();
	return results;
}

// ---- Series ------------------------------------------------------------------

type SeriesBook = { position: number; title: string };

/** Links a book to its series. Other books in the series are stored as names only — never added as sources. */
export async function saveSeries(db: D1Database, sourceId: number, author: string | undefined, s: { name: string; position?: number; books?: SeriesBook[] }) {
	const nameKey = normalize(s.name).replace(/^the /, "").replace(/ (series|trilogy|saga|quartet|cycle)$/, "");
	const aKey = authorKey(author);
	let row = await db.prepare("SELECT id, books FROM series WHERE name_key = ? AND author_key = ?").bind(nameKey, aKey).first<{ id: number; books: string }>();
	if (!row) row = await db.prepare("INSERT INTO series (name, name_key, author_key) VALUES (?, ?, ?) RETURNING id, books").bind(s.name.trim(), nameKey, aKey).first<{ id: number; books: string }>();
	const books: SeriesBook[] = JSON.parse(row!.books);
	for (const b of s.books ?? []) if (!books.some((x) => x.position === b.position)) books.push({ position: b.position, title: b.title.trim() });
	books.sort((a, b) => a.position - b.position);
	await db.batch([
		db.prepare("UPDATE series SET books = ? WHERE id = ?").bind(JSON.stringify(books), row!.id),
		db.prepare("UPDATE sources SET series_id = ?, series_position = COALESCE(?, series_position) WHERE id = ?").bind(row!.id, s.position ?? null, sourceId),
		// Link (never add) other books of the series that are already in the hub, matched by title + author.
		...books.map((b) =>
			db
				.prepare("UPDATE sources SET series_id = ?, series_position = COALESCE(series_position, ?) WHERE id != ? AND series_id IS NULL AND title_key = ? AND author_key = ?")
				.bind(row!.id, b.position, sourceId, titleKey(b.title), aKey),
		),
	]);
}

export async function getSeriesFor(db: D1Database, seriesId: number | null) {
	if (!seriesId) return null;
	const [series, members] = await db.batch([
		db.prepare("SELECT id, name, books FROM series WHERE id = ?").bind(seriesId),
		db.prepare("SELECT id, title, series_position FROM sources WHERE series_id = ?").bind(seriesId),
	]);
	const s = series.results[0] as { id: number; name: string; books: string } | undefined;
	if (!s) return null;
	const inHub = members.results as { id: number; title: string; series_position: number | null }[];
	const books: { position: number; title: string; source_id?: number }[] = JSON.parse(s.books);
	for (const m of inHub) {
		const listed = books.find((b) => (m.series_position != null && b.position === m.series_position) || normalize(b.title) === normalize(m.title));
		if (listed) listed.source_id = m.id;
		else if (m.series_position != null) books.push({ position: m.series_position, title: m.title, source_id: m.id });
	}
	books.sort((a, b) => a.position - b.position);
	return { id: s.id, name: s.name, books };
}

// ---- Home: "keeps coming up" ---------------------------------------------------

export async function setHiddenFromFeatured(db: D1Database, id: number, hidden: boolean) {
	await db.prepare("UPDATE sources SET hide_from_featured = ? WHERE id = ?").bind(hidden ? 1 : 0, id).run();
}
