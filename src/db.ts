// All database access goes through here, so the storage layer can change without touching tools or hub.

import { DEFAULT_CURRENCY, isCurrency, type Currency } from "./currency";
import { authorKey, bestMatch, normalize, requestFingerprint, titleKey, type Candidate } from "./matching";
import { applyStatusEvent, eventForStatus, getSeriesFor, saveSeries, saveTags } from "./library";
import { STATUSES, toStatus, type Status } from "./status";

export { STATUSES };

export const KINDS = ["book", "paper", "article", "blog", "thread", "talk", "video", "other"] as const;
export const TYPES = ["fiction", "nonfiction", "biography", "autobiography"] as const;
export const FEATURES = ["recs", "details", "discuss", "summary", "shelf", "store", "giveaway", "checkin"] as const;
export const ORIGINS = ["recommended", "list_article", "lookup", "checkin", "store"] as const;
/** Origins that count toward "featured" and ★ Most featured. Check-in and store picks don't. */
export const COUNTED_ORIGINS = "('recommended','list_article')";

export type Source = {
	id: number;
	kind: (typeof KINDS)[number];
	title: string;
	subtitle: string | null;
	authors: string[];
	title_key: string;
	author_key: string;
	type: (typeof TYPES)[number] | null;
	is_textbook: number;
	year: number | null;
	year_source: string | null;
	pages: number | null;
	pages_source: string | null;
	difficulty: string | null;
	url: string | null;
	cover_url: string | null;
	library_status: Status;
	one_liner: string | null;
	status_changed_at: string | null;
	finished_on: string | null;
	buy_rank: number | null;
	buy_format: string | null;
	bought_on: string | null;
	bought_format: string | null;
	bought_price: number | null;
	bought_currency: string | null;
	owned_format: string | null;
	archive_reason: string | null;
	archived_on: string | null;
	given_on: string | null;
	given_price: number | null;
	given_currency: string | null;
	rating: number | null;
	reread: string | null;
	hide_from_featured: number;
	series_id: number | null;
	series_position: number | null;
	created_at: string;
	updated_at: string;
};

export type EditionInput = {
	label: string;
	translator?: string;
	publisher?: string;
	isbn13?: string;
	language?: string;
	owned?: boolean;
	notes?: string;
};

export type SourceInput = {
	kind?: Source["kind"];
	title: string;
	subtitle?: string;
	authors: string[];
	type?: NonNullable<Source["type"]>;
	is_textbook?: boolean;
	year?: number;
	year_source?: string;
	pages?: number;
	pages_source?: string;
	difficulty?: string;
	url?: string;
	cover_url?: string;
	isbn13?: string[];
	ol_work?: string;
	aliases?: string[];
	edition?: EditionInput;
	/** Any of the seven statuses; v1 names like "on_shelf" are accepted. On an existing book it only moves forward. */
	library_status?: string;
	one_liner?: string;
	tags?: string[];
	series?: { name: string; position?: number; books?: { position: number; title: string }[] };
	/** YYYY-MM-DD, only if the user said when. Unknown dates stay empty. */
	finished_on?: string;
	confirm_new?: boolean;
	merge_into?: number;
};

export type SaveResult =
	| { status: "created" | "matched"; source: SourceDetail }
	| { status: "possible_duplicates"; candidates: { id: number; title: string; authors: string[]; year: number | null; score: number }[] };

function parseSource(row: any): Source {
	const { legacy_status: _legacy, ...rest } = row;
	return { ...rest, authors: JSON.parse(row.authors ?? "[]") };
}

// ---- Matching ----------------------------------------------------------------

async function matchCandidates(db: D1Database): Promise<Candidate[]> {
	const { results } = await db
		.prepare("SELECT id, title_key, author_key FROM sources UNION ALL SELECT source_id AS id, title_key, author_key FROM source_aliases")
		.all<Candidate>();
	return results;
}

async function findByIds(db: D1Database, input: Pick<SourceInput, "isbn13" | "ol_work" | "url">): Promise<number | null> {
	const pairs: [string, string][] = [
		...(input.isbn13 ?? []).map((v): [string, string] => ["isbn13", v]),
		...(input.ol_work ? [["ol_work", input.ol_work] as [string, string]] : []),
		...(input.url ? [["url", input.url] as [string, string]] : []),
	];
	for (const [kind, value] of pairs) {
		const row = await db.prepare("SELECT source_id FROM source_ids WHERE kind = ? AND value = ?").bind(kind, value).first<{ source_id: number }>();
		if (row) return row.source_id;
	}
	return null;
}

/** Look for an existing source without writing anything. */
export async function findSource(db: D1Database, title: string, author?: string) {
	const result = bestMatch(titleKey(title), authorKey(author), await matchCandidates(db));
	if (result.kind === "match") return { kind: "match" as const, source: await getSource(db, result.source.id) };
	if (result.kind === "possible") {
		return {
			kind: "possible" as const,
			candidates: await Promise.all(result.candidates.map(async (c) => ({ score: round(c.score), source: (await getSourceRow(db, c.source.id))! }))),
		};
	}
	return { kind: "none" as const };
}

// ---- Save --------------------------------------------------------------------

export async function saveSource(db: D1Database, input: SourceInput): Promise<SaveResult> {
	const tKey = titleKey(input.title);
	const aKey = authorKey(input.authors[0]);

	let existingId = input.merge_into ?? (await findByIds(db, input));
	if (!existingId) {
		const result = bestMatch(tKey, aKey, await matchCandidates(db));
		if (result.kind === "match") existingId = result.source.id;
		else if (result.kind === "possible" && !input.confirm_new) {
			const candidates = await Promise.all(
				result.candidates.map(async (c) => {
					const s = (await getSourceRow(db, c.source.id))!;
					return { id: s.id, title: s.title, authors: s.authors, year: s.year, score: round(c.score) };
				}),
			);
			return { status: "possible_duplicates", candidates };
		}
	}

	if (existingId) {
		const existing = await getSourceRow(db, existingId);
		if (!existing) throw new Error(`Source ${existingId} not found`);
		await fillMissing(db, existing, input);
		const wanted = toStatus(input.library_status);
		if (wanted) await applyStatusEvent(db, existing.id, eventForStatus(wanted), { finished_on: input.finished_on });
		await saveDetails(db, existing.id, input);
		if (tKey !== existing.title_key || aKey !== existing.author_key) await addAlias(db, existing.id, input.title, tKey, aKey);
		for (const alias of input.aliases ?? []) await addAlias(db, existing.id, alias, titleKey(alias), aKey);
		await addIds(db, existing.id, input);
		if (input.edition) await upsertEdition(db, existing.id, input.edition);
		return { status: "matched", source: (await getSource(db, existing.id))! };
	}

	const row = await db
		.prepare(
			`INSERT INTO sources (kind, title, subtitle, authors, title_key, author_key, type, is_textbook, year, year_source,
			 pages, pages_source, difficulty, url, cover_url, one_liner)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		)
		.bind(
			input.kind ?? "book",
			input.title.trim(),
			input.subtitle ?? null,
			JSON.stringify(input.authors),
			tKey,
			aKey,
			input.type ?? null,
			input.is_textbook ? 1 : 0,
			input.year ?? null,
			input.year != null ? (input.year_source ?? "unknown") : null,
			input.pages ?? null,
			input.pages != null ? (input.pages_source ?? "unknown") : null,
			input.difficulty ?? null,
			input.url ?? null,
			input.cover_url ?? null,
			input.one_liner ?? null,
		)
		.first<{ id: number }>();
	const id = row!.id;
	const wanted = toStatus(input.library_status);
	if (wanted && wanted !== "none") await applyStatusEvent(db, id, eventForStatus(wanted), { finished_on: input.finished_on });
	await saveDetails(db, id, { ...input, one_liner: undefined });
	for (const alias of input.aliases ?? []) await addAlias(db, id, alias, titleKey(alias), aKey);
	await addIds(db, id, input);
	if (input.edition) await upsertEdition(db, id, input.edition);
	return { status: "created", source: (await getSource(db, id))! };
}

/** On a match, only fill gaps — never overwrite what's already stored. Library status only moves forward. */
async function fillMissing(db: D1Database, s: Source, input: SourceInput) {
	const sets: string[] = [];
	const vals: unknown[] = [];
	const fill = (col: keyof Source, value: unknown) => {
		if (value != null && (s[col] == null || s[col] === "")) {
			sets.push(`${col} = ?`);
			vals.push(value);
		}
	};
	fill("subtitle", input.subtitle);
	fill("type", input.type);
	if (s.year == null && input.year != null) {
		fill("year", input.year);
		fill("year_source", input.year_source ?? "unknown");
	}
	if (s.pages == null && input.pages != null) {
		fill("pages", input.pages);
		fill("pages_source", input.pages_source ?? "unknown");
	}
	fill("difficulty", input.difficulty);
	fill("url", input.url);
	fill("cover_url", input.cover_url);
	if (s.authors.length === 0 && input.authors.length) {
		sets.push("authors = ?", "author_key = ?");
		vals.push(JSON.stringify(input.authors), authorKey(input.authors[0]));
	}
	if (input.is_textbook && !s.is_textbook) sets.push("is_textbook = 1");
	if (sets.length === 0) return;
	sets.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')");
	await db.prepare(`UPDATE sources SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, s.id).run();
}

/** One-liner (always updatable — it's descriptive, not the user's data), tags (added, never removed here) and series. */
async function saveDetails(db: D1Database, id: number, input: SourceInput) {
	if (input.one_liner?.trim()) await db.prepare("UPDATE sources SET one_liner = ? WHERE id = ?").bind(input.one_liner.trim(), id).run();
	if (input.tags?.length) await saveTags(db, id, input.tags);
	if (input.series?.name) await saveSeries(db, id, input.authors[0], input.series);
}

async function addAlias(db: D1Database, id: number, alias: string, tKey: string, aKey: string) {
	if (!tKey) return;
	await db.prepare("INSERT OR IGNORE INTO source_aliases (source_id, title_key, author_key, alias) VALUES (?, ?, ?, ?)").bind(id, tKey, aKey, alias.trim()).run();
}

async function addIds(db: D1Database, id: number, input: Pick<SourceInput, "isbn13" | "ol_work" | "url">) {
	const stmts = [
		...(input.isbn13 ?? []).map((v) => ["isbn13", v]),
		...(input.ol_work ? [["ol_work", input.ol_work]] : []),
		...(input.url ? [["url", input.url]] : []),
	].map(([kind, value]) => db.prepare("INSERT OR IGNORE INTO source_ids (kind, value, source_id) VALUES (?, ?, ?)").bind(kind, value, id));
	if (stmts.length) await db.batch(stmts);
}

async function upsertEdition(db: D1Database, sourceId: number, e: EditionInput) {
	const { results } = await db.prepare("SELECT id, label, isbn13 FROM editions WHERE source_id = ?").bind(sourceId).all<{ id: number; label: string; isbn13: string | null }>();
	const existing = results.find((r) => (e.isbn13 && r.isbn13 === e.isbn13) || normalize(r.label) === normalize(e.label));
	if (existing) {
		await db
			.prepare(
				`UPDATE editions SET translator = COALESCE(translator, ?), publisher = COALESCE(publisher, ?), isbn13 = COALESCE(isbn13, ?),
				 language = COALESCE(language, ?), owned = MAX(owned, ?), notes = COALESCE(?, notes) WHERE id = ?`,
			)
			.bind(e.translator ?? null, e.publisher ?? null, e.isbn13 ?? null, e.language ?? null, e.owned ? 1 : 0, e.notes ?? null, existing.id)
			.run();
		return;
	}
	await db
		.prepare("INSERT INTO editions (source_id, label, translator, publisher, isbn13, language, owned, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(sourceId, e.label, e.translator ?? null, e.publisher ?? null, e.isbn13 ?? null, e.language ?? null, e.owned ? 1 : 0, e.notes ?? null)
		.run();
}

// ---- Read --------------------------------------------------------------------

export async function getSourceRow(db: D1Database, id: number): Promise<Source | null> {
	const row = await db.prepare("SELECT * FROM sources WHERE id = ?").bind(id).first();
	return row ? parseSource(row) : null;
}

export type SourceDetail = Source & {
	hub_url_path: string;
	tags: string[];
	series: { id: number; name: string; books: { position: number; title: string; source_id?: number }[] } | null;
	review: { id: number; text: string; created_at: string } | null;
	came_up_for: string | null;
	most_featured: boolean;
	research: Awaited<ReturnType<typeof getResearch>>;
	aliases: string[];
	editions: any[];
	notes: { id: number; text: string; kind: string; locator: string | null; created_at: string }[];
	appearance_count: number;
	discussion_count: number;
	summary_count: number;
};

export async function getSource(db: D1Database, id: number): Promise<SourceDetail | null> {
	const source = await getSourceRow(db, id);
	if (!source) return null;
	const [aliases, editions, notes, counts, tags, firstRequest] = await db.batch([
		db.prepare("SELECT alias FROM source_aliases WHERE source_id = ?").bind(id),
		db.prepare("SELECT id, label, translator, publisher, isbn13, language, owned, notes FROM editions WHERE source_id = ? ORDER BY id").bind(id),
		db.prepare("SELECT id, text, kind, locator, created_at FROM notes WHERE source_id = ? ORDER BY id DESC").bind(id),
		db
			.prepare(
				`SELECT (SELECT COUNT(*) FROM appearances a WHERE a.source_id = ?1 AND a.origin IN ${COUNTED_ORIGINS}) AS appearance_count,
				 (SELECT COUNT(*) FROM discussions WHERE source_id = ?1) AS discussion_count,
				 (SELECT COUNT(*) FROM summaries WHERE source_id = ?1) AS summary_count`,
			)
			.bind(id),
		db.prepare("SELECT tag FROM source_tags WHERE source_id = ? ORDER BY tag").bind(id),
		db.prepare("SELECT r.input FROM appearances a JOIN requests r ON r.id = a.request_id WHERE a.source_id = ? ORDER BY r.id LIMIT 1").bind(id),
	]);
	const c = (counts.results[0] ?? {}) as any;
	const [research, featured, series] = await Promise.all([getResearch(db, id), mostFeaturedIds(db), getSeriesFor(db, source.series_id)]);
	const allNotes = notes.results as any[];
	return {
		...source,
		hub_url_path: `/book/${id}`,
		tags: (tags.results as any[]).map((t) => t.tag),
		series,
		review: allNotes.find((n) => n.kind === "review") ?? null,
		came_up_for: (firstRequest.results[0] as any)?.input ?? null,
		most_featured: featured.has(id),
		research,
		aliases: (aliases.results as any[]).map((a) => a.alias),
		editions: editions.results as any[],
		notes: allNotes.filter((n) => n.kind !== "review"),
		appearance_count: c.appearance_count ?? 0,
		discussion_count: c.discussion_count ?? 0,
		summary_count: c.summary_count ?? 0,
	};
}

export async function listSources(
	db: D1Database,
	opts: {
		query?: string;
		status?: Status;
		statuses?: Status[];
		archiveReason?: string;
		includeArchived?: boolean;
		tag?: string;
		/** Multi-select filters: a row matches if it has any of the values. */
		types?: string[];
		kinds?: string[];
		tags?: string[];
		timelessAny?: string[];
		offset?: number;
		kind?: Source["kind"];
		type?: Source["type"];
		timeless?: string;
		mostFeatured?: boolean;
		sort?: keyof typeof SORTS;
		limit?: number;
	} = {},
): Promise<ListedSource[]> {
	const where: string[] = [];
	const vals: unknown[] = [];
	if (opts.status) (where.push("s.library_status = ?"), vals.push(opts.status));
	if (opts.kind) (where.push("s.kind = ?"), vals.push(opts.kind));
	if (opts.type) (where.push("s.type = ?"), vals.push(opts.type));
	if (opts.statuses?.length) (where.push(`s.library_status IN (${opts.statuses.map(() => "?").join(",")})`), vals.push(...opts.statuses));
	if (opts.archiveReason) (where.push("s.archive_reason = ?"), vals.push(opts.archiveReason));
	if (!opts.status && !opts.statuses && !opts.includeArchived) where.push("s.library_status != 'archived'");
	if (opts.tag) (where.push("s.id IN (SELECT source_id FROM source_tags WHERE tag = ?)"), vals.push(opts.tag));
	if (opts.timeless) (where.push("json_extract(c.card, '$.timeless') = ?"), vals.push(opts.timeless));
	const anyOf = (expr: string, values?: string[]) => {
		if (values?.length) (where.push(`${expr} IN (${values.map(() => "?").join(",")})`), vals.push(...values));
	};
	anyOf("s.type", opts.types);
	anyOf("s.kind", opts.kinds);
	anyOf("json_extract(c.card, '$.timeless')", opts.timelessAny);
	if (opts.tags?.length) (where.push(`s.id IN (SELECT source_id FROM source_tags WHERE tag IN (${opts.tags.map(() => "?").join(",")}))`), vals.push(...opts.tags));
	if (opts.query) {
		where.push("(s.title LIKE ? OR s.authors LIKE ? OR s.one_liner LIKE ? OR s.id IN (SELECT source_id FROM source_aliases WHERE alias LIKE ?) OR s.id IN (SELECT source_id FROM source_tags WHERE tag LIKE ?))");
		const like = `%${opts.query}%`;
		vals.push(like, like, like, like, like);
	}
	const { results } = await db
		.prepare(
			`SELECT s.*, (SELECT COUNT(*) FROM appearances a WHERE a.source_id = s.id AND a.origin IN ${COUNTED_ORIGINS}) AS appearance_count,
			 json_extract(c.card, '$.timeless') AS timeless, json_extract(c.card, '$.buy') AS buy,
			 (SELECT group_concat(tag, '|') FROM source_tags t WHERE t.source_id = s.id) AS tag_list,
			 (SELECT r.input FROM appearances a JOIN requests r ON r.id = a.request_id WHERE a.source_id = s.id ORDER BY r.id LIMIT 1) AS came_up_for,
			 (SELECT MAX(m.id) FROM summaries m WHERE m.source_id = s.id) AS summary_id,
			 EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id AND n.kind = 'review') AS has_review,
			 c.card IS NOT NULL AS has_card
			 FROM sources s LEFT JOIN cards c ON c.source_id = s.id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${SORTS[opts.sort ?? "recent"]} LIMIT ? OFFSET ?`,
		)
		.bind(...vals, opts.limit ?? 50, opts.offset ?? 0)
		.all();
	const featured = await mostFeaturedIds(db);
	const rows: ListedSource[] = results.map((r: any) => {
		const { tag_list, summary_id, has_review, has_card, ...row } = r;
		return {
			...parseSource(row),
			appearance_count: r.appearance_count,
			most_featured: featured.has(r.id),
			timeless: r.timeless,
			buy: r.buy,
			tags: tag_list ? String(tag_list).split("|") : [],
			came_up_for: r.came_up_for,
			summary_id: summary_id ?? null,
			has_review: Boolean(has_review),
			has_card: Boolean(has_card),
		};
	});
	const kept = opts.mostFeatured ? rows.filter((r) => r.most_featured) : rows;
	return opts.sort === "best" ? kept.sort(bestFirst) : kept;
}

/**
 * Discover's default order. Books you haven't acted on first; Reading and Buy list last (already decided).
 * Within each group: ★ keeps coming up → timeless → too new but promising → most-featured count → most recent.
 */
const STATUS_ORDER: Record<string, number> = { none: 0, own: 1, finished: 2, given_away: 3, archived: 4, reading: 5, want_to_buy: 6 };
const TIMELESS_ORDER: Record<string, number> = { yes: 0, too_new_promising: 1, not_applicable: 2, too_new_not: 4, no: 5 };
function bestFirst(a: ListedSource, b: ListedSource) {
	return (
		(STATUS_ORDER[a.library_status] ?? 9) - (STATUS_ORDER[b.library_status] ?? 9) ||
		Number(b.most_featured) - Number(a.most_featured) ||
		(TIMELESS_ORDER[a.timeless ?? ""] ?? 3) - (TIMELESS_ORDER[b.timeless ?? ""] ?? 3) ||
		b.appearance_count - a.appearance_count ||
		b.updated_at.localeCompare(a.updated_at)
	);
}

export type ListedSource = Source & {
	appearance_count: number;
	most_featured: boolean;
	timeless: string | null;
	buy: string | null;
	tags: string[];
	came_up_for: string | null;
	summary_id: number | null;
	has_review: boolean;
	has_card: boolean;
};

const SORTS = {
	// My shelf: Reading → Not started → Finished, review pending → Finished & reviewed → Read via summary → Given away.
	library: `CASE s.library_status WHEN 'reading' THEN 0 WHEN 'own' THEN 1
		WHEN 'finished' THEN (CASE WHEN EXISTS (SELECT 1 FROM notes n WHERE n.source_id = s.id AND n.kind = 'review') THEN 3 ELSE 2 END)
		WHEN 'archived' THEN 4 WHEN 'given_away' THEN 5 ELSE 6 END, s.status_changed_at DESC, s.title COLLATE NOCASE`,
	buy: "s.buy_rank IS NULL, s.buy_rank, s.title COLLATE NOCASE",
	best: "s.updated_at DESC, s.id DESC", // re-sorted in code by bestFirst
	recent: "s.updated_at DESC, s.id DESC",
	title: "s.title COLLATE NOCASE",
	year: "s.year IS NULL, s.year DESC",
	featured: "appearance_count DESC, s.title COLLATE NOCASE",
} as const;

// ---- Library -----------------------------------------------------------------

export { setStatus as setLibraryStatus } from "./library";

/** A note means the user has the book and is reading it (unless already finished). */
export async function addNote(db: D1Database, sourceId: number, text: string, locator?: string) {
	const row = await db
		.prepare("INSERT INTO notes (source_id, text, locator) VALUES (?, ?, ?) RETURNING id, created_at")
		.bind(sourceId, text, locator?.trim() || null)
		.first<{ id: number; created_at: string }>();
	await applyStatusEvent(db, sourceId, "note_added");
	return row;
}

// ---- Requests and appearances ------------------------------------------------

export type AppearanceInput = { source_id: number; rank?: number; fit_score?: number; origin: (typeof ORIGINS)[number] };

/** Re-running the same request (same feature + wording) reuses it, so appearances aren't double-counted. */
export async function logRequest(db: D1Database, feature: (typeof FEATURES)[number], input: string, appearances: AppearanceInput[]) {
	const fingerprint = await requestFingerprint(feature, input);
	const existing = await db.prepare("SELECT id FROM requests WHERE fingerprint = ?").bind(fingerprint).first<{ id: number }>();
	let requestId: number;
	if (existing) {
		requestId = existing.id;
		await db.prepare("UPDATE requests SET runs = runs + 1, last_run_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?").bind(requestId).run();
	} else {
		requestId = (await db.prepare("INSERT INTO requests (feature, input, fingerprint) VALUES (?, ?, ?) RETURNING id").bind(feature, input, fingerprint).first<{ id: number }>())!.id;
	}
	if (appearances.length) {
		await db.batch(
			appearances.map((a) =>
				db
					.prepare(
						`INSERT INTO appearances (request_id, source_id, rank, fit_score, origin) VALUES (?, ?, ?, ?, ?)
						 ON CONFLICT (request_id, source_id) DO UPDATE SET rank = excluded.rank, fit_score = excluded.fit_score, origin = excluded.origin`,
					)
					.bind(requestId, a.source_id, a.rank ?? null, a.fit_score ?? null, a.origin),
			),
		);
	}
	return { request_id: requestId, repeat: Boolean(existing) };
}

// ---- Rules -------------------------------------------------------------------

export type Rule = { name: string; title: string; body: string; version: number; updated_at: string };

export async function getRules(db: D1Database, names?: string[]): Promise<Rule[]> {
	const { results } = names?.length
		? await db.prepare(`SELECT * FROM rules WHERE name IN (${names.map(() => "?").join(",")}) ORDER BY name`).bind(...names).all<Rule>()
		: await db.prepare("SELECT * FROM rules ORDER BY name").all<Rule>();
	return results;
}

/** Saves a new version; the previous one is kept in rules_history. */
export async function saveRule(db: D1Database, name: string, title: string, body: string) {
	const current = await db.prepare("SELECT version, body FROM rules WHERE name = ?").bind(name).first<{ version: number; body: string }>();
	if (!current) {
		await db.prepare("INSERT INTO rules (name, title, body) VALUES (?, ?, ?)").bind(name, title, body).run();
		return 1;
	}
	if (current.body === body) return current.version;
	await db.batch([
		db.prepare("INSERT OR IGNORE INTO rules_history (name, version, body) VALUES (?, ?, ?)").bind(name, current.version, current.body),
		db.prepare("UPDATE rules SET title = ?, body = ?, version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE name = ?").bind(title, body, name),
	]);
	return current.version + 1;
}

// ---- Feedback ----------------------------------------------------------------

export async function saveFeedback(db: D1Database, text: string, context?: string) {
	return db.prepare("INSERT INTO feedback (text, context) VALUES (?, ?) RETURNING id").bind(text, context ?? null).first<{ id: number }>();
}

// ---- helpers -----------------------------------------------------------------

function round(n: number) {
	return Math.round(n * 100) / 100;
}

// ---- Hub-only operations (never exposed as connector tools) -----------------

export async function getAppearances(db: D1Database, sourceId: number) {
	const { results } = await db
		.prepare(
			`SELECT r.feature, r.input, r.created_at, r.runs, a.rank, a.fit_score, a.origin
			 FROM appearances a JOIN requests r ON r.id = a.request_id WHERE a.source_id = ? ORDER BY r.created_at DESC`,
		)
		.bind(sourceId)
		.all<{ feature: string; input: string; created_at: string; runs: number; rank: number | null; fit_score: number | null; origin: string }>();
	return results;
}

export async function deleteNote(db: D1Database, noteId: number) {
	await db.prepare("DELETE FROM notes WHERE id = ?").bind(noteId).run();
}

/** Deletes a source and everything attached to it. Hub only. */
export async function deleteSource(db: D1Database, id: number) {
	const tables = ["source_aliases", "source_ids", "source_tags", "facts", "cards", "appearances", "notes", "discussions", "summaries", "editions"];
	await db.batch([...tables.map((t) => db.prepare(`DELETE FROM ${t} WHERE source_id = ?`).bind(id)), db.prepare("DELETE FROM sources WHERE id = ?").bind(id)]);
}

export async function getRuleHistory(db: D1Database, name: string) {
	const { results } = await db.prepare("SELECT version, body, saved_at FROM rules_history WHERE name = ? ORDER BY version DESC").bind(name).all<{ version: number; body: string; saved_at: string }>();
	return results;
}

// ---- Research cache: cards and facts ----------------------------------------

export type CardInput = {
	timeless?: "yes" | "no" | "too_new_promising" | "too_new_not" | "not_applicable";
	buy?: "first_hand" | "second_hand" | "kindle" | "summary" | "skip" | "not_sure";
	confidence?: "high" | "medium" | "low";
	core_idea?: string;
	markdown: string;
};

export async function saveCard(db: D1Database, sourceId: number, card: CardInput) {
	await db
		.prepare(
			`INSERT INTO cards (source_id, card) VALUES (?, ?)
			 ON CONFLICT (source_id) DO UPDATE SET card = excluded.card, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
		)
		.bind(sourceId, JSON.stringify(card))
		.run();
}

export type FactInput = { field: string; value: string; link?: string; edition?: string; note?: string };

/** Each save adds a dated row; reads show the newest per field (and endorsement per value). */
export async function saveFacts(db: D1Database, sourceId: number, facts: FactInput[]) {
	if (!facts.length) return;
	await db.batch(
		facts.map((f) =>
			db
				.prepare("INSERT INTO facts (source_id, field, value, link, note) VALUES (?, ?, ?, ?, ?)")
				.bind(sourceId, f.field, f.value, f.link ?? null, [f.edition && `Edition: ${f.edition}`, f.note].filter(Boolean).join(" · ") || null),
		),
	);
}

const ageDays = (iso: string, now = Date.now()) => Math.floor((now - Date.parse(iso)) / 86400_000);

export async function getResearch(db: D1Database, sourceId: number) {
	const [card, facts] = await db.batch([
		db.prepare("SELECT card, updated_at FROM cards WHERE source_id = ?").bind(sourceId),
		db.prepare("SELECT id, field, value, link, note, checked_at FROM facts WHERE source_id = ? ORDER BY checked_at DESC, id DESC").bind(sourceId),
	]);
	const c = card.results[0] as { card: string; updated_at: string } | undefined;
	// Newest value per field; endorsements are kept per endorser (value).
	const seen = new Set<string>();
	const latest = (facts.results as any[]).filter((f) => {
		const key = f.field === "endorsement" ? `${f.field}|${f.value}` : f.field;
		return seen.has(key) ? false : (seen.add(key), true);
	});
	return {
		card: c ? { ...(JSON.parse(c.card) as CardInput), updated_at: c.updated_at, age_days: ageDays(c.updated_at) } : null,
		facts: latest.map((f) => ({ ...f, age_days: ageDays(f.checked_at) })),
	};
}

// ---- Discussions and summaries ---------------------------------------------

export async function saveDiscussion(db: D1Database, d: { source_id: number; locator?: string; title: string; body: string; discussion_id?: number }) {
	if (d.discussion_id) {
		const res = await db
			.prepare("UPDATE discussions SET locator = COALESCE(?, locator), title = ?, body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? AND source_id = ?")
			.bind(d.locator ?? null, d.title, d.body, d.discussion_id, d.source_id)
			.run();
		if (res.meta.changes > 0) return { id: d.discussion_id, updated: true };
	}
	const row = await db.prepare("INSERT INTO discussions (source_id, locator, title, body) VALUES (?, ?, ?, ?) RETURNING id").bind(d.source_id, d.locator ?? null, d.title, d.body).first<{ id: number }>();
	await applyStatusEvent(db, d.source_id, "discussed");
	return { id: row!.id, updated: false };
}

export async function listDiscussions(db: D1Database, opts: { sourceId?: number; query?: string; limit?: number } = {}) {
	const where: string[] = [];
	const vals: unknown[] = [];
	if (opts.sourceId) (where.push("d.source_id = ?"), vals.push(opts.sourceId));
	if (opts.query) (where.push("(d.title LIKE ?1x OR d.body LIKE ?1x OR d.locator LIKE ?1x OR s.title LIKE ?1x)".replace(/\?1x/g, "?")), vals.push(...Array(4).fill(`%${opts.query}%`)));
	const { results } = await db
		.prepare(
			`SELECT d.id, d.source_id, s.title AS book, d.locator, d.title, d.body, d.created_at, d.updated_at
			 FROM discussions d JOIN sources s ON s.id = d.source_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY d.updated_at DESC LIMIT ?`,
		)
		.bind(...vals, opts.limit ?? 50)
		.all<{ id: number; source_id: number; book: string; locator: string | null; title: string; body: string; created_at: string; updated_at: string }>();
	return results;
}

export async function getDiscussion(db: D1Database, id: number) {
	return db
		.prepare("SELECT d.*, s.title AS book FROM discussions d JOIN sources s ON s.id = d.source_id WHERE d.id = ?")
		.bind(id)
		.first<{ id: number; source_id: number; book: string; locator: string | null; title: string; body: string; created_at: string; updated_at: string }>();
}

export async function saveSummary(db: D1Database, sourceId: number, body: string) {
	return db.prepare("INSERT INTO summaries (source_id, body) VALUES (?, ?) RETURNING id, created_at").bind(sourceId, body).first<{ id: number; created_at: string }>();
}

export async function listSummaries(db: D1Database, opts: { sourceId?: number; query?: string; limit?: number } = {}) {
	const where: string[] = [];
	const vals: unknown[] = [];
	if (opts.sourceId) (where.push("m.source_id = ?"), vals.push(opts.sourceId));
	if (opts.query) (where.push("(m.body LIKE ? OR s.title LIKE ?)"), vals.push(`%${opts.query}%`, `%${opts.query}%`));
	const { results } = await db
		.prepare(
			`SELECT m.id, m.source_id, s.title AS book, m.body, m.created_at FROM summaries m JOIN sources s ON s.id = m.source_id
			 ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY m.created_at DESC LIMIT ?`,
		)
		.bind(...vals, opts.limit ?? 50)
		.all<{ id: number; source_id: number; book: string; body: string; created_at: string }>();
	return results;
}

export async function getSummary(db: D1Database, id: number) {
	return db.prepare("SELECT m.*, s.title AS book FROM summaries m JOIN sources s ON s.id = m.source_id WHERE m.id = ?").bind(id).first<{ id: number; source_id: number; book: string; body: string; created_at: string }>();
}

// ---- Most featured -----------------------------------------------------------

/** Reads "top N%" and "at least M separate requests" from the most-featured rule so it stays editable in the hub. */
export function parseMostFeaturedRule(body: string | undefined) {
	const percent = Number(body?.match(/top\s*\**\s*(\d+(?:\.\d+)?)\s*%/i)?.[1] ?? 5);
	const minRequests = Number(body?.match(/at least\s*\**\s*(\d+)\s*\**\s*separate request/i)?.[1] ?? 3);
	return { percent, minRequests };
}

/** Source ids that are ★ Most featured: in the top N% by separate-request count AND at least M requests. */
export async function mostFeaturedIds(db: D1Database): Promise<Set<number>> {
	const [rule, counts, total] = await db.batch([
		db.prepare("SELECT body FROM rules WHERE name = 'most-featured'"),
		db.prepare(`SELECT source_id, COUNT(DISTINCT request_id) AS n FROM appearances WHERE origin IN ${COUNTED_ORIGINS} GROUP BY source_id ORDER BY n DESC`),
		db.prepare("SELECT COUNT(*) AS n FROM sources"),
	]);
	const { percent, minRequests } = parseMostFeaturedRule((rule.results[0] as any)?.body);
	const rows = counts.results as { source_id: number; n: number }[];
	const topK = Math.max(1, Math.ceil(((total.results[0] as any).n * percent) / 100));
	const threshold = Math.max(minRequests, rows[topK - 1]?.n ?? Infinity);
	return new Set(rows.filter((r) => r.n >= threshold).map((r) => r.source_id));
}

// ---- Reading profile (for book fit) ------------------------------------------

/**
 * Compact view of the user's reading, for labelling and book fit. Kept short on purpose (it's sent to Claude on
 * every recommendation): one line per book, recent notes trimmed.
 */
export async function getReadingProfile(db: D1Database) {
	const [books, notes] = await db.batch([
		db.prepare(
			"SELECT id, title, authors, type, library_status, archive_reason, rating, reread FROM sources WHERE library_status != 'none' ORDER BY library_status, title",
		),
		db.prepare("SELECT n.source_id, s.title, n.kind, n.text FROM notes n JOIN sources s ON s.id = n.source_id ORDER BY n.id DESC LIMIT 40"),
	]);
	const line = (b: any) => `#${b.id} ${b.title} — ${(JSON.parse(b.authors)[0] ?? "?")}${b.type ? ` (${b.type})` : ""}${b.rating != null ? ` · rated ${b.rating}/10` : ""}${b.reread ? ` · reread: ${b.reread}` : ""}`;
	const group = (status: string, reason?: string) =>
		(books.results as any[]).filter((b) => b.library_status === status && (reason === undefined || b.archive_reason === reason)).map(line);
	return {
		reading: group("reading"),
		finished: group("finished"),
		own_not_started: group("own"),
		want_to_buy: group("want_to_buy"),
		read_via_summary: group("archived", "read_via_summary"),
		archived_never_recommend: (books.results as any[]).filter((b) => b.library_status === "archived").map(line),
		given_away: group("given_away"),
		recent_notes_and_reviews: (notes.results as any[]).map((n) => `${n.kind === "review" ? "REVIEW" : "note"} on #${n.source_id} ${n.title}: ${n.text.replace(/\s+/g, " ").slice(0, 300)}`),
	};
}

// ---- Merge (hub only) ----------------------------------------------------------

/** Moves everything from one source into another, then deletes the first. */
export async function mergeSources(db: D1Database, fromId: number, intoId: number) {
	if (fromId === intoId) return false;
	const [from, into] = await Promise.all([getSourceRow(db, fromId), getSourceRow(db, intoId)]);
	if (!from || !into) return false;
	await fillMissing(db, into, {
		title: from.title,
		authors: from.authors,
		subtitle: from.subtitle ?? undefined,
		type: from.type ?? undefined,
		year: from.year ?? undefined,
		year_source: from.year_source ?? undefined,
		pages: from.pages ?? undefined,
		pages_source: from.pages_source ?? undefined,
		difficulty: from.difficulty ?? undefined,
		url: from.url ?? undefined,
		cover_url: from.cover_url ?? undefined,
	});
	await applyStatusEvent(db, intoId, eventForStatus(from.library_status), { finished_on: from.finished_on ?? undefined });
	await db.batch([
		db.prepare("INSERT OR IGNORE INTO source_aliases (source_id, title_key, author_key, alias) VALUES (?, ?, ?, ?)").bind(intoId, from.title_key, from.author_key, from.title),
		db.prepare("INSERT OR IGNORE INTO source_aliases (source_id, title_key, author_key, alias) SELECT ?, title_key, author_key, alias FROM source_aliases WHERE source_id = ?").bind(intoId, fromId),
		db.prepare("UPDATE OR IGNORE source_ids SET source_id = ? WHERE source_id = ?").bind(intoId, fromId),
		db.prepare("INSERT OR IGNORE INTO appearances (request_id, source_id, rank, fit_score, origin) SELECT request_id, ?, rank, fit_score, origin FROM appearances WHERE source_id = ?").bind(intoId, fromId),
		db.prepare("INSERT OR IGNORE INTO cards (source_id, card, updated_at) SELECT ?, card, updated_at FROM cards WHERE source_id = ?").bind(intoId, fromId),
		db.prepare("INSERT OR IGNORE INTO source_tags (source_id, tag) SELECT ?, tag FROM source_tags WHERE source_id = ?").bind(intoId, fromId),
		db.prepare("UPDATE sources SET one_liner = COALESCE(one_liner, ?), rating = COALESCE(rating, ?), reread = COALESCE(reread, ?), series_id = COALESCE(series_id, ?), series_position = COALESCE(series_position, ?) WHERE id = ?").bind(from.one_liner, from.rating, from.reread, from.series_id, from.series_position, intoId),
		...["editions", "facts", "notes", "discussions", "summaries"].map((t) => db.prepare(`UPDATE ${t} SET source_id = ? WHERE source_id = ?`).bind(intoId, fromId)),
	]);
	await deleteSource(db, fromId);
	return true;
}

// ---- Feedback (hub) and test runs -------------------------------------------

export async function listFeedback(db: D1Database) {
	const { results } = await db.prepare("SELECT * FROM feedback ORDER BY status = 'resolved', id DESC").all<{ id: number; text: string; context: string | null; status: string; resolution: string | null; created_at: string; resolved_at: string | null }>();
	return results;
}

export async function resolveFeedback(db: D1Database, id: number, resolution: string, reopen = false) {
	await db
		.prepare(reopen ? "UPDATE feedback SET status = 'open', resolved_at = NULL WHERE id = ?" : "UPDATE feedback SET status = 'resolved', resolution = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?")
		.bind(...(reopen ? [id] : [resolution || null, id]))
		.run();
}

export async function saveTestRun(db: D1Database, summary: unknown) {
	return db.prepare("INSERT INTO test_runs (summary) VALUES (?) RETURNING id").bind(JSON.stringify(summary)).first<{ id: number }>();
}

export async function listTestRuns(db: D1Database, limit = 10) {
	const { results } = await db.prepare("SELECT id, summary, created_at FROM test_runs ORDER BY id DESC LIMIT ?").bind(limit).all<{ id: number; summary: string; created_at: string }>();
	return results.map((r) => ({ ...r, summary: JSON.parse(r.summary) }));
}

export async function recentRequests(db: D1Database, limit = 10, offset = 0) {
	const { results } = await db
		.prepare("SELECT r.id, r.feature, r.input, r.last_run_at, (SELECT COUNT(*) FROM appearances a WHERE a.request_id = r.id) AS sources FROM requests r ORDER BY r.last_run_at DESC, r.id DESC LIMIT ? OFFSET ?")
		.bind(limit, offset)
		.all<{ id: number; feature: string; input: string; last_run_at: string; sources: number }>();
	return results;
}

// ---- Settings ----------------------------------------------------------------

export async function getSetting(db: D1Database, key: string) {
	return (await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string) {
	await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')").bind(key, value).run();
}

/** The user's currency (Profile & settings). New hubs default to US dollars until changed. */
export async function getCurrency(db: D1Database): Promise<Currency> {
	const v = await getSetting(db, "currency");
	return isCurrency(v) ? v : DEFAULT_CURRENCY;
}
