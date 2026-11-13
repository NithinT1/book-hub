import { env } from "cloudflare:workers";
import { McpServer } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import {
	addNote,
	getReadingProfile,
	getSummary,
	listDiscussions,
	listSummaries,
	saveCard,
	saveDiscussion,
	saveFacts,
	saveSummary,
	FEATURES,
	findSource,
	getRules,
	getSource,
	getSourceRow,
	KINDS,
	listSources,
	logRequest,
	ORIGINS,
	saveFeedback,
	saveSource,
	setLibraryStatus,
	STATUSES,
	TYPES,
	type SaveResult,
	getCurrency,
	findReferenceScore,
	FIT_LABELS,
	TIERS,
	VERDICTS,
	VERDICT_HOWS,
	saveQuiz,
	IDEA_RESULTS,
	QUIZ_OUTCOMES,
} from "./db";
import { CURRENCIES } from "./currency";
import { saveReview, setStatus } from "./library";
import { lookupBook } from "./openlibrary";
import { ARCHIVE_REASONS, BUY_FORMATS, toStatus } from "./status";
import { ensureDefaultRules, FLOW_NAMES, rulesForFlow } from "./rules-defaults";

const INSTRUCTIONS = `Book Hub is the user's private reading hub: library, buy list, notes, reviews, recommendation history and the rules for how to answer book questions.
Before answering a book request or saving anything, call get_rules with the flow for the request (recs, details, store, shelf, checkin, summary, discuss, quiz) and follow the rules it returns.
Never invent books, ratings, prices, quotes or endorsements. There is no delete tool: deleting and merging happen in the hub.
Results include hub_url links; end answers with them so the user can continue in the hub.`;

const STATUS_HELP =
	"none (not decided) | want_to_buy (Buy list) | own (on shelf, not started) | reading | stopped (put down partway; only when the user says so) | finished | archived | given_away. Old name on_shelf = own.";

// The connector deliberately has no delete tools.
export function createServer(context?: { requestInfo?: Request }) {
	const server = new McpServer({ name: "Book Hub", version: "2.11.0" }, { instructions: INSTRUCTIONS });
	const login = getMcpAuthContext()?.props?.login as string | undefined;
	const db = env.DB;
	// Links in answers point at this hub: HUB_URL if set, else the address the connector was reached on.
	const base = (env.HUB_URL || (context?.requestInfo ? new URL(context.requestInfo.url).origin : "") || (env.MCP_RESOURCE ? new URL(env.MCP_RESOURCE).origin : "")).replace(/\/$/, "");
	const link = (path: string) => base + path;
	const withLinks = (r: SaveResult) => (r.status === "possible_duplicates" ? r : { ...r, hub_url: link(`/book/${r.source.id}`), buy_list_url: link("/buy") });

	server.registerTool(
		"get_rules",
		{
			description:
				"Read the user's rules (criteria, output format, and how each feature works) from Book Hub. Call before answering any book request. Pass the flow for the request (recs, details, store, shelf, checkin, summary, discuss) to get exactly the rules it needs, or names for specific rules. Omit both to get all.",
			inputSchema: z.object({
				flow: z.enum(FLOW_NAMES as [string, ...string[]]).optional().describe("recs | details | store | shelf | checkin | summary | discuss | quiz"),
				names: z.array(z.string()).optional(),
			}),
		},
		async ({ flow, names }) => {
			await ensureDefaultRules(db);
			const wanted = flow ? rulesForFlow(flow as (typeof FLOW_NAMES)[number], (await getRules(db)).map((r) => r.name)) : names;
			const rules = await getRules(db, wanted);
			if (rules.length === 0) return text(`No rules found${names ? ` for: ${names.join(", ")}` : ""}.`);
			const cur = await getCurrency(db);
			const sym = CURRENCIES[cur].symbol.trim();
			const money = `<!-- setting: currency -->\nThe user's currency is ${cur} (${sym}). Quote prices in it; when a price you find is in another currency, give both. Save new-copy prices with save_facts field "price", value with the symbol (e.g. "${sym}399").`;
			return text(money + "\n\n---\n\n" + rules.map((r) => `<!-- rule: ${r.name} · v${r.version} · updated ${r.updated_at} -->\n${r.body}`).join("\n\n---\n\n"));
		},
	);

	server.registerTool(
		"lookup_book",
		{
			description:
				"Find a book: returns up to 3 Open Library candidates (year, pages, ISBNs, cover; may contain errors) and whether it's already in Book Hub. Pass a cleaned-up title and author, not the user's raw text.",
			inputSchema: z.object({ title: z.string().min(1), author: z.string().optional() }),
		},
		async ({ title, author }) => {
			const [hub, openLibrary, reference] = await Promise.all([findSource(db, title, author), lookupBook(title, author), findReferenceScore(db, title, author)]);
			return json({
				in_book_hub: hub,
				...(reference ? { reference_score: { ...reference, use: "The reader's own saved Quality score for this book: use it as the Quality and say so." } } : {}),
				open_library: openLibrary,
				note: openLibrary.length
					? "Open Library data can be wrong (years especially). Verify before relying on it and record the source."
					: "Open Library found nothing. Use your own knowledge or web search, and label the source.",
			});
		},
	);

	server.registerTool(
		"save_source",
		{
			description:
				"Add a book (or paper, article, thread…) to Book Hub, or update it if it already exists. Matching is automatic; if it returns possible_duplicates, ask the user and call again with merge_into or confirm_new. Read the connector-guide rule first.",
			inputSchema: z.object({
				kind: z.enum(KINDS).optional(),
				title: z.string().min(1),
				subtitle: z.string().optional(),
				authors: z.array(z.string()).describe("Original author first — never the translator."),
				type: z.enum(TYPES).optional(),
				is_textbook: z.boolean().optional(),
				year: z.number().int().optional(),
				year_source: z.string().optional().describe("openlibrary | claude-web | claude-memory | user"),
				pages: z.number().int().positive().optional(),
				pages_source: z.string().optional(),
				difficulty: z.enum(["easy", "medium", "hard"]).optional(),
				url: z.string().url().optional(),
				cover_url: z.string().url().refine((u) => u.startsWith("https://"), "https only").optional(),
				isbn13: z.array(z.string().regex(/^\d{13}$/)).optional(),
				ol_work: z.string().optional().describe("Open Library work id, e.g. OL1168083W"),
				aliases: z.array(z.string()).optional().describe("Other names: the user's wording, short forms, original-language title."),
				edition: z
					.object({
						label: z.string(),
						translator: z.string().optional(),
						publisher: z.string().optional(),
						isbn13: z.string().optional(),
						language: z.string().optional(),
						owned: z.boolean().optional(),
						notes: z.string().optional(),
					})
					.optional()
					.describe("A specific translation or edition, e.g. the one the user owns."),
				library_status: z
					.string()
					.refine((v) => toStatus(v) !== undefined, "Unknown status")
					.optional()
					.describe(`Only when the user says so. ${STATUS_HELP} On an existing book it only moves forward.`),
				one_liner: z.string().max(300).optional().describe("Spoiler-free: what it is and why it's interesting, in one line."),
				tags: z.array(z.string().max(40)).max(6).optional().describe("2–4 tags from the tags rule (genre/mood/topic)."),
				series: z
					.object({
						name: z.string().min(1).max(200),
						position: z.number().optional(),
						books: z.array(z.object({ position: z.number(), title: z.string() })).optional().describe("The other books in the series, as names only."),
					})
					.optional()
					.describe("Only if the book is part of a series."),
				finished_on: z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.optional()
					.describe("Only if the user said when they finished. Never guess or use today's date."),
				confirm_new: z.boolean().optional().describe("Only after the user confirms it's NOT one of the possible duplicates."),
				merge_into: z.number().int().optional().describe("Only after the user confirms it IS this existing source."),
			}),
		},
		async (input) => json(withLinks(await saveSource(db, input))),
	);

	server.registerTool(
		"get_source",
		{
			description:
				"Get everything Book Hub holds on one source: details, editions, notes, appearance count, ★ most featured, the current Verdict (verdict_locked = the reader or a quiz set it; don't change it), quizzes (newest first; partial = stopped midway), any reference_score (the reader's own saved Quality), and saved research (card with Quality, Timeless and Fit, plus facts with age_days, to reuse per the research-reuse rule). Pass id, or title + author.",
			inputSchema: z.object({ id: z.number().int().optional(), title: z.string().optional(), author: z.string().optional() }),
		},
		async ({ id, title, author }) => {
			if (id) {
				const s = await getSource(db, id);
				return json(s ? { ...s, hub_url: link(s.hub_url_path) } : { error: `No source with id ${id}` });
			}
			if (title) return json(await findSource(db, title, author));
			return text("Pass id, or title (+ author).");
		},
	);

	server.registerTool(
		"search_library",
		{
			description:
				"Search or list Book Hub sources by text, status or verdict (want_to_buy returns the Buy list in the user's order). For recommending, prefer get_reading_profile.",
			inputSchema: z.object({
				query: z.string().optional(),
				verdict: z.enum(VERDICTS).optional(),
				status: z.string().refine((v) => toStatus(v) !== undefined, "Unknown status").optional().describe(STATUS_HELP),
				kind: z.enum(KINDS).optional(),
				limit: z.number().int().min(1).max(200).optional(),
			}),
		},
		async ({ status, verdict, ...opts }) => {
			const st = toStatus(status);
			const rows = await listSources(db, { ...opts, status: st, verdictAny: verdict ? [verdict] : undefined, sort: st === "want_to_buy" ? "buy" : "recent" });
			return json(
				rows.map((s) => ({ id: s.id, title: s.title, authors: s.authors, type: s.type, year: s.year, status: s.library_status, verdict: s.verdict, quality: s.quality, fit: s.fit, buy_rank: s.buy_rank, rating: s.rating, appearances: s.appearance_count, hub_url: link(`/book/${s.id}`) })),
			);
		},
	);

	server.registerTool(
		"set_library_status",
		{
			description: `Change a book's status when the user explicitly asks (e.g. "add to my buy list", "I bought it second-hand for 250", "archive it", "I gave it away"). ${STATUS_HELP} Pass finished_on only if the user said when.`,
			inputSchema: z.object({
				source_id: z.number().int(),
				status: z.string().refine((v) => toStatus(v) !== undefined, "Unknown status"),
				finished_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
				archive_reason: z.enum(ARCHIVE_REASONS).optional().describe("For archived: not_useful, or read_via_summary"),
				buy_format: z.enum(BUY_FORMATS).optional().describe("For want_to_buy: preferred format"),
				bought_format: z.enum(BUY_FORMATS).optional().describe("For own after buying"),
				bought_price: z.number().min(0).optional().describe("In the user's currency (see get_rules)"),
				owned_format: z.enum(["physical", "kindle", "both"]).optional(),
				given_price: z.number().min(0).optional().describe("In the user's currency, for given_away"),
			}),
		},
		async ({ source_id, status, ...details }) => {
			const ok = await setStatus(db, source_id, status, details);
			return text(ok ? `Source #${source_id} is now "${toStatus(status)}". ${link(`/book/${source_id}`)}` : `No source with id ${source_id}.`);
		},
	);

	server.registerTool(
		"add_note",
		{
			description: "Save the user's own note on a source (optionally with chapter/page). A note means they're reading it, so the status moves to Reading unless already finished. Notes are used as context in later answers.",
			inputSchema: z.object({ source_id: z.number().int(), text: z.string().min(1).max(20000), locator: z.string().max(100).optional().describe("Chapter or page") }),
		},
		async ({ source_id, text: body, locator }) => {
			if (!(await getSourceRow(db, source_id))) return text(`No source with id ${source_id}.`);
			const note = await addNote(db, source_id, body, locator);
			return text(`Saved note #${note!.id} on source #${source_id}. ${link(`/book/${source_id}`)}`);
		},
	);

	server.registerTool(
		"save_review",
		{
			description:
				"Save the user's review of a book: rating 0–10, would they re-read, and the review text (use the review template sections). Marks the book finished unless finished=false (a mid-book rating).",
			inputSchema: z.object({
				source_id: z.number().int(),
				rating: z.number().int().min(0).max(10).optional(),
				reread: z.enum(["yes", "maybe", "no"]).optional(),
				body: z.string().min(1).max(50000),
				finished: z.boolean().optional(),
				finished_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
			}),
		},
		async ({ source_id, ...review }) => {
			if (!(await getSourceRow(db, source_id))) return text(`No source with id ${source_id}.`);
			await saveReview(db, source_id, review);
			return text(`Saved review for source #${source_id}. ${link(`/book/${source_id}`)}`);
		},
	);

	server.registerTool(
		"log_request",
		{
			description:
				"Record a feature run and which sources appeared in it, in rank order. Call once per answer (recs, details…), after saving the sources. Re-running the same request is detected and not double-counted.",
			inputSchema: z.object({
				feature: z.enum(FEATURES),
				input: z.string().min(1).describe("The user's request, as they phrased it."),
				appearances: z.array(
					z.object({
						source_id: z.number().int(),
						rank: z.number().int().optional(),
						fit_score: z.number().min(0).max(10).optional(),
						origin: z.enum(ORIGINS).describe("recommended = you recommended it; list_article = found in a list the user shared; lookup = user asked about it directly"),
					}),
				),
			}),
		},
		async ({ feature, input, appearances }) => json(await logRequest(db, feature, input, appearances)),
	);

	server.registerTool(
		"save_card",
		{
			description:
				"Save the full card for a source (markdown, as shown to the user) plus its Quality, Timeless, Fit and Verdict, so they're reused and shown in the hub. Replaces the previous card. The Verdict is kept on the book with its history; if the reader set their own, it isn't changed.",
			inputSchema: z.object({
				source_id: z.number().int(),
				markdown: z.string().min(1).max(60000),
				quality: z.number().min(0).max(10).optional().describe("0–10, one decimal (quality rule)"),
				quality_tier: z.enum(TIERS).optional(),
				quality_factors: z.record(z.string().max(40), z.number().int().min(1).max(5)).optional().describe('Factor name → 1–5, e.g. {"Foundation": 4, "Reach": 5}'),
				belief: z.string().max(300).optional().describe("The belief it breaks, if you can name one"),
				mistake: z.string().max(300).optional().describe("The costly mistake it prevents, if you can name one"),
				critic: z.string().max(200).optional().describe("Its strongest critic"),
				timeless: z.enum(["yes", "no", "too_new_promising", "too_new_not", "not_applicable"]).optional().describe("Fiction: classic status (yes / no / too_new_promising / too_new_not)"),
				fit: z.number().min(0).max(10).optional().describe("0–10 (fit rule)"),
				fit_label: z.enum(FIT_LABELS).optional(),
				fit_reason: z.string().max(300).optional(),
				verdict: z.enum(VERDICTS).optional().describe("verdict rule"),
				verdict_how: z.enum(VERDICT_HOWS).optional().describe("For read / read_parts / reread: how to get it"),
				verdict_why: z.string().max(500).optional().describe("One line"),
				confidence: z.enum(["high", "medium", "low"]).optional(),
				core_idea: z.string().max(1000).optional(),
				buy: z.enum(["first_hand", "second_hand", "kindle", "summary", "skip", "not_sure"]).optional().describe("Older field; use verdict and verdict_how instead"),
			}),
		},
		async ({ source_id, ...card }) => {
			if (!(await getSourceRow(db, source_id))) return text(`No source with id ${source_id}.`);
			const r = await saveCard(db, source_id, card);
			const note =
				r.verdict === "locked" ? ` The reader set their own Verdict (${r.current}); it was kept. If you disagree, say so in one line.`
				: r.verdict === "changed" ? ` Verdict changed from ${r.previous} to ${card.verdict ?? "the new one"}: tell the reader why.`
				: "";
			return text(`Saved card for source #${source_id}.${note}`);
		},
	);

	server.registerTool(
		"save_quiz",
		{
			description:
				"Save a Book Quiz result (quiz rule). Call with partial: true after every answer (progress; the hub keeps one in-progress record per book and updates it), then once more with the final result. A finished quiz sets and locks the book's Verdict (unless outcome is info). History of finished quizzes is kept. Never changes the book's status.",
			inputSchema: z.object({
				source_id: z.number().int(),
				score: z.number().min(0).max(10).describe('"You already know", 0–10; high = the reader already holds the book'),
				practice: z.number().min(0).max(10).optional().describe("Self books: how much the reader actually does it"),
				mode: z.enum(["scan", "deep"]).optional(),
				partial: z.boolean().optional().describe("Progress so far (save after every answer); false or omitted for the final result"),
				outcome: z.enum(QUIZ_OUTCOMES).optional().describe("keep | skip | practise | info (biographies, wisdom texts, art books: informs only)"),
				verdict: z.enum(VERDICTS).optional(),
				verdict_why: z.string().max(500).optional(),
				practice_tip: z.string().max(500).optional().describe("For practise: the one practice"),
				ideas: z
					.array(
						z.object({
							idea: z.string().min(1).max(300),
							core: z.boolean().optional(),
							result: z.enum(IDEA_RESULTS),
							covered_by: z.string().max(200).optional().describe("A finished book that carries it"),
							note: z.string().max(500).optional().describe("The right answer in one line"),
						}),
					)
					.min(1)
					.max(15),
				ideas_left: z.array(z.string().max(300)).max(15).optional().describe("Ideas marked New or Partly"),
				replacement: z.string().max(500).optional(),
				chapters: z.string().max(500).optional().describe("For Read parts: which chapters"),
				confidence: z.enum(["high", "medium"]).optional(),
				summary: z.string().max(30000).optional().describe("The debrief (markdown)"),
			}),
		},
		async ({ source_id, ...quiz }) => {
			if (!(await getSourceRow(db, source_id))) return text(`No source with id ${source_id}.`);
			const r = await saveQuiz(db, source_id, quiz);
			const v = r.verdict.verdict === "not_set" ? (quiz.partial ? " Progress saved; if the reader stops, they can continue from Home." : "") : ` Verdict ${r.verdict.verdict === "unchanged" ? "unchanged" : "set and locked"}.`;
			return text(`Saved quiz #${r.id} for source #${source_id}: you already know ${r.score}/10.${v} ${link(`/book/${source_id}`)}`);
		},
	);

	server.registerTool(
		"save_facts",
		{
			description:
				"Save researched facts with their link, so they're reused instead of searched again. Fields: amazon_rating, goodreads_rating, price (new copy, in the user's currency, value with its symbol), endorsement (value = who + what they said), or others. Only facts you actually found — never estimates.",
			inputSchema: z.object({
				source_id: z.number().int(),
				facts: z
					.array(
						z.object({
							field: z.string().min(1).max(50),
							value: z.string().min(1).max(2000).describe('e.g. "4.4/5 (12,345 ratings)", "$12.99", "Bill Gates — Summer reading list 2019"'),
							link: z.string().url().optional(),
							edition: z.string().max(200).optional(),
							note: z.string().max(500).optional(),
						}),
					)
					.min(1),
			}),
		},
		async ({ source_id, facts }) => {
			if (!(await getSourceRow(db, source_id))) return text(`No source with id ${source_id}.`);
			await saveFacts(db, source_id, facts);
			return text(`Saved ${facts.length} fact(s) for source #${source_id}.`);
		},
	);

	server.registerTool(
		"get_reading_profile",
		{
			description:
				"The user's reading at a glance: reading, finished (with ratings), owned, buy list, read via summary, archived (never recommend these), and recent notes/reviews. Use only to LABEL picks and judge taste/level — never to choose books because they're already in the list.",
		},
		async () => json(await getReadingProfile(db)),
	);

	server.registerTool(
		"save_discussion",
		{
			description:
				"Save a reading discussion as a written record (key points, the user's positions, connections, open questions) — not a transcript. Pass discussion_id to update one you're continuing.",
			inputSchema: z.object({
				source_id: z.number().int(),
				locator: z.string().max(200).optional().describe("Chapter, verse or topic, e.g. 'Ch. 7 History and War', '2.47'"),
				title: z.string().min(1).max(200),
				body: z.string().min(1).max(100000).describe("Markdown"),
				discussion_id: z.number().int().optional(),
			}),
		},
		async (d) => {
			if (!(await getSourceRow(db, d.source_id))) return text(`No source with id ${d.source_id}.`);
			const r = await saveDiscussion(db, d);
			return text(`${r.updated ? "Updated" : "Saved"} discussion #${r.id}. ${link(`/discussion/${r.id}`)}`);
		},
	);

	server.registerTool(
		"get_discussions",
		{
			description: "Past saved discussions for a source (newest first), or search all discussions by text. Use before a discussion and to continue one.",
			inputSchema: z.object({ source_id: z.number().int().optional(), query: z.string().optional(), limit: z.number().int().min(1).max(20).optional() }),
		},
		async ({ source_id, query, limit }) => json(await listDiscussions(db, { sourceId: source_id, query, limit: limit ?? 5 })),
	);

	server.registerTool(
		"save_summary",
		{
			description: "Save a long book summary (markdown). Each save is a new version; older ones are kept.",
			inputSchema: z.object({ source_id: z.number().int(), body: z.string().min(1).max(400000) }),
		},
		async ({ source_id, body }) => {
			if (!(await getSourceRow(db, source_id))) return text(`No source with id ${source_id}.`);
			const r = await saveSummary(db, source_id, body);
			return text(`Saved summary #${r!.id} for source #${source_id}. ${link(`/summary/${r!.id}`)}`);
		},
	);

	server.registerTool(
		"get_summary",
		{
			description: "The latest saved summary for a source (full text), or a specific one by summary_id. Returns nothing if none exists yet.",
			inputSchema: z.object({ source_id: z.number().int().optional(), summary_id: z.number().int().optional() }),
		},
		async ({ source_id, summary_id }) => {
			if (summary_id) return json((await getSummary(db, summary_id)) ?? { error: `No summary #${summary_id}` });
			if (!source_id) return text("Pass source_id or summary_id.");
			const [latest] = await listSummaries(db, { sourceId: source_id, limit: 1 });
			return latest ? json(latest) : text(`No saved summary for source #${source_id}.`);
		},
	);

	server.registerTool(
		"save_feedback",
		{
			description: 'Save the user\'s feedback about Book Hub (e.g. "book hub feedback: …") to the Feedback inbox, with a line of context.',
			inputSchema: z.object({ text: z.string().min(1).max(5000), context: z.string().max(5000).optional() }),
		},
		async ({ text: body, context }) => {
			const row = await saveFeedback(db, body, context);
			return text(`Saved feedback #${row!.id}. It will be reviewed in Claude Code.`);
		},
	);

	server.registerTool("hub_status", { description: "Check the Book Hub connection and what it holds." }, async () => {
		const c = await db
			.prepare(
				`SELECT (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM sources WHERE library_status='finished') AS finished,
				 (SELECT COUNT(*) FROM sources WHERE library_status='own') AS on_shelf_not_started, (SELECT COUNT(*) FROM sources WHERE library_status='reading') AS reading,
				 (SELECT COUNT(*) FROM sources WHERE library_status='want_to_buy') AS buy_list, (SELECT COUNT(*) FROM requests) AS requests,
				 (SELECT COUNT(*) FROM feedback WHERE status='open') AS open_feedback`,
			)
			.first();
		return json({ signed_in_as: login ?? "unknown", ...c });
	});

	return server;
}

function text(t: string) {
	return { content: [{ type: "text" as const, text: t }] };
}

function json(value: unknown) {
	return text(JSON.stringify(value, null, 1));
}
