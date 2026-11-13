// Shared hub building blocks: page shell, navigation, book rows, labels.

import type { Context } from "hono";
import type { Bindings } from "../auth";
import type { ListedSource, Source } from "../db";
import { esc } from "../markdown";
import { ARCHIVE_LABEL, BUY_FORMAT_LABEL, SHELF_STATUSES, STATUS_LABEL, type ArchiveReason, type BuyFormat, type Status } from "../status";

export { esc };
export type HubEnv = { Bindings: Bindings; Variables: { login: string; aiApp?: AiApp } };
export type HubContext = Context<HubEnv>;

export const TYPE_LABEL: Record<string, string> = { fiction: "Fiction", nonfiction: "Non-fiction", biography: "Biography", autobiography: "Autobiography" };
export const KIND_LABEL: Record<string, string> = { book: "Book", paper: "Paper", article: "Article", blog: "Blog post", thread: "Thread", talk: "Talk", video: "Video", other: "Other" };
export const TIMELESS_LABEL: Record<string, string> = { yes: "Timeless: yes", no: "Timeless: no", too_new_promising: "Too new: promising", too_new_not: "Too new: not", not_applicable: "Fiction" };
export const VERDICT_LABEL: Record<string, string> = { read: "Read", read_parts: "Read parts", reread: "Reread", idea_only: "Idea only", practise: "Practise instead", bench: "Bench", skip: "Skip", not_sure: "Not sure" };
export const QUIZ_OUTCOME_LABEL: Record<string, string> = { keep: "Quizzed: keep", skip: "Quizzed: skip", practise: "Quizzed: practise", info: "Quizzed" };
/** Book Quiz is for idea books. */
export const isQuizzable = (s: { type: string | null; kind: string }) => s.kind === "book" && s.type !== "fiction";
export const HOW_LABEL: Record<string, string> = { first_hand: "first-hand", second_hand: "second-hand", kindle: "Kindle", modern_alternative: "modern alternative", borrow: "borrow" };
export const FIT_LABEL: Record<string, string> = { general_self: "General + Self", self: "Self", general: "General", none: "" };
export const TIER_LABEL: Record<string, string> = { core: "Core", strong: "Strong", good: "Good", edge: "Edge" };
/** "Read · second-hand" */
export const verdictText = (v: string | null, how?: string | null) => (v ? `${VERDICT_LABEL[v] ?? v}${how && HOW_LABEL[how] ? ` · ${HOW_LABEL[how]}` : ""}` : "");
/** "8.3 · Strong" */
export const qualityText = (q: number | null | undefined, tier?: string | null) => (q == null ? "" : `${Number(q).toFixed(1)}${tier && TIER_LABEL[tier] ? ` · ${TIER_LABEL[tier]}` : ""}`);
/** "8 · Self" */
export const fitText = (f: number | null | undefined, label?: string | null) => (f == null ? "" : `${Math.round(Number(f) * 10) / 10}${label && FIT_LABEL[label] ? ` · ${FIT_LABEL[label]}` : ""}`);
export const BUY_LABEL: Record<string, string> = { first_hand: "Buy first-hand", second_hand: "Buy second-hand", kindle: "Kindle", summary: "Claude summary", skip: "Skip", not_sure: "Not sure" };
export { ARCHIVE_LABEL, BUY_FORMAT_LABEL, STATUS_LABEL };

export const claudeLink = (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

// ---- Which AI app the Ask buttons open (Profile & settings) ----
// Links are always written for Claude; for other apps a small script turns the /book-… command into plain words
// (other apps have no skills, but the connector's rules carry the same instructions) and opens or copies it.
export const AI_APPS = {
	claude: ["Claude", "Tested. Opens claude.ai with the command typed in."],
	chatgpt: ["ChatGPT", "Not tested. Opens chatgpt.com with the request in plain words. Needs the Book Hub connector added in ChatGPT."],
	other: ["Another AI app", "Copies the request so you can paste it into any AI app connected to Book Hub."],
} as const;
export type AiApp = keyof typeof AI_APPS;
export const isAiApp = (v: unknown): v is AiApp => typeof v === "string" && v in AI_APPS;

const AI_JS = `(()=>{const app=document.body.dataset.ai;if(!app||app==="claude")return;
const FLOW={"book-recs":"recs","book-details":"details","book-discuss":"discuss","book-summary":"summary","book-store":"store","book-shelf":"shelf","book-checkin":"checkin","book-quiz":"quiz"};
const plain=(q)=>{const m=q.match(/^\\/(book-[a-z-]+)\\s*([\\s\\S]*)$/);if(!m)return q;const f=FLOW[m[1]];return "Book Hub request: "+(m[2]||"(ask me what I need)")+"\\n\\nUse my Book Hub connector: "+(f?"call get_rules with flow \\""+f+"\\" first and follow the rules it returns.":"save this with save_feedback.");};
document.addEventListener("click",(e)=>{const a=e.target.closest('a[href^="https://claude.ai/new?q="]');if(!a)return;e.preventDefault();
const q=plain(new URL(a.href).searchParams.get("q")||"");
if(app==="chatgpt"){window.open("https://chatgpt.com/?q="+encodeURIComponent(q),"_blank","noopener");return;}
navigator.clipboard.writeText(q).then(()=>{const t=document.createElement("div");t.className="toast";t.textContent="Copied. Paste it into your AI app.";document.body.append(t);setTimeout(()=>t.remove(),2500);});});})();`;

// ---- What each action does (hover tooltips) ----

export const HELP = {
	quiz: ["Book Quiz", "Opens your AI app with /book-quiz. About 5–10 minutes of questions on the book's core ideas, then \"You already know: X/10\" and a Verdict: skip it, read parts, read it, or practise instead. Saved here."],
	recs: ["Recommend books", "Opens your AI app with /book-recs and your topic typed in. Claude reads your rules, picks up to 5 books fresh for the topic (fewer if fewer fit), labels any already in your hub, saves them to Discover and links back here."],
	details: ["Book details", "Opens your AI app with /book-details. For one or more named books (or a link to a list): a full card, ranking and buy verdict. The research is saved, so asking again later is quick."],
	store: ["At a book store", "Opens your AI app with /book-store. Send a photo or name of a book plus its price: you get buy-or-skip and the discount vs a new copy. Or send a rack photo: up to 5 books worth picking."],
	checkin: ["Check-in", "Opens your AI app with /book-checkin. Monthly or quarterly: 2 books like ones you loved, 2 different or opposing, 2 from your Buy list, plus what's pending. Nothing changes until you act."],
	add: ["Add a book yourself", "Search the free Open Library catalogue and add a book straight to your Buy list or shelf. Doesn't use Claude."],
	fullDetails: ["Full details", "Opens your AI app with /book-details for this book: card, timeless verdict, ratings and price with links, buy decision. Saved to this page."],
	refreshDetails: ["Refresh details", "Opens your AI app to research this book again (new prices, ratings, endorsements) and update the card on this page."],
	discuss: ["Discuss", "Opens your AI app with /book-discuss for this book. It loads your notes and past discussions, then goes deep on a chapter or idea. Say “save” to keep it here. Marks the book as Reading."],
	summary: ["Long summary", "Opens your AI app with /book-summary: a 30–60 minute read instead of the book, with critique and an originality check. Saved to Notes → Summaries. Doesn't change the status."],
	continueDiscussion: ["Continue in Claude", "Opens your AI app to pick this discussion up where you left off, starting from its open questions."],
	buy: ["Add to Buy list", "Puts this book at the bottom of your Buy list. Reorder it on the Buy list tab."],
	bought: ["Bought it", "Record how you bought it (first-hand, second-hand or Kindle) and the price. Moves it to My shelf → Not started and off the Buy list."],
	startReading: ["Start reading", "Moves it to Reading. Adding a note does this automatically."],
	finish: ["Finished — write review", "Jumps to the review form. Saving the review marks the book Finished."],
	give: ["Give away", "Record that you gave it away (optional price). It moves to My shelf → Given away; your notes and review stay."],
	archive: ["Archive", "Hides it from your lists and Claude never recommends it again. You pick why: “Not useful” or “Read via summary” (which shows on My shelf). Undo any time from the book page."],
	unarchive: ["Unarchive", "Brings it back as Not decided, so it shows in Discover and can be recommended again."],
	moveUp: ["Move up", "Moves this book one place higher on your Buy list."],
	moveDown: ["Move down", "Moves this book one place lower on your Buy list."],
	hideFeatured: ["Hide from here", "Stops showing this book in “Keeps coming up”. It stays everywhere else, and its ★ count isn't affected."],
	setStatus: ["Set status", "Sets any status by hand, ignoring the automatic rules. Use it to fix a wrong status."],
	merge: ["Merge", "For duplicates: moves this book's notes, review, history and summaries into the book number you enter, then removes this one."],
	delete: ["Delete permanently", "Removes the book and all its history for good. Archive is usually better."],
	addNote: ["Add note", "Saves your note (with chapter or page if you add one). Claude uses your notes in later answers. The first note marks the book as Reading."],
	saveReview: ["Save review", "Saves your rating, re-read answer and review. Marks the book Finished unless you untick “I've finished it”."],
	note: ["Note", "Opens the book's note box, ready to type (the microphone key dictates). Adding a note keeps the book in Reading."],
	review: ["Review", "Opens the review form: rating 0–10, would you re-read, and the review template. Saving marks the book Finished."],
	editReview: ["Edit review", "Opens your saved review to change the rating or text."],
	readSummary: ["Read summary", "Opens the long summary you already have, here in the hub — no Claude needed."],
	addShelfPhotos: ["Add shelf photos", "Opens your AI app with /book-shelf. Send photos of your bookshelf: Claude lists the books it can read, skips ones already here, and adds the rest to My shelf after you say “save”."],
	giveawayCheck: ["Give-away check", "Opens your AI app with /book-shelf. Name some books or send a shelf photo: you get a table of only the books worth giving away, why, and a price range. Nothing changes until you record it on the book's page."],
	priceCheck: ["2nd-hand price check", "Opens your AI app with /book-store. Send a photo or the name of a book plus the price on it: you get buy-or-skip, the discount vs a new copy, and whether it's on your lists."],
	addNoteFromNotes: ["Add a note", "Pick a book from your shelf; its note box opens ready to type. A note on a book you haven't started marks it Reading."],
	addReviewFromNotes: ["Write a review", "Pick a book you're reading or have finished; its review form opens. Saving marks it Finished."],
	rackCheck: ["Rack gem check", "Opens your AI app with /book-store. Send a photo of a rack or shelf in the store: up to 5 books worth picking — from your lists or rare finds — with discounts and why."],
} as const;
export type HelpKey = keyof typeof HELP;

export const tip = (key: HelpKey) => ` title="${esc(HELP[key][1])}"`;

export const askButton = (label: string, prompt: string, cls = "btn secondary", help?: HelpKey) =>
	`<a class="${cls}" href="${esc(claudeLink(prompt))}" target="_blank" rel="noopener"${help ? tip(help) : ""}>${label}</a>`;

export const statusLabel = (s: Source) =>
	s.library_status === "archived" && s.archive_reason ? `Archived · ${ARCHIVE_LABEL[s.archive_reason as ArchiveReason]}` : STATUS_LABEL[s.library_status];

export function statusBadge(s: Source) {
	if (s.library_status === "none") return "";
	const cls = ({ finished: "ok", reading: "live", want_to_buy: "buy", archived: "muted-tag", given_away: "muted-tag" } as Record<string, string>)[s.library_status] ?? "";
	return `<span class="tag ${cls}">${esc(s.library_status === "archived" && s.archive_reason === "read_via_summary" ? "Read via summary" : STATUS_LABEL[s.library_status])}</span>`;
}

export function yearText(year: number) {
	return year < 0 ? `${-year} BCE` : year < 1000 ? `c. ${year} CE` : String(year);
}

/** Real covers only for books you have (or had); every other book gets a plain block with its first letter, so rows line up. */
export function cover(s: Source, size: "thumb" | "large") {
	if (SHELF_STATUSES.includes(s.library_status) && s.cover_url) return `<img class="cover ${size}" src="${esc(s.cover_url)}" alt="" loading="lazy">`;
	return `<span class="cover ${size} placeholder" aria-hidden="true">${esc(s.title.slice(0, 1))}</span>`;
}

const ICON = {
	archive: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>`,
	up: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 15l6-6 6 6"/></svg>`,
	down: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/></svg>`,
	hide: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>`,
};

export type RowOptions = { hideFeatured?: boolean; back?: string; price?: string | null; reorder?: boolean; inline?: boolean; verdictNote?: boolean };

const ACT_ICON: Record<string, string> = {
	discuss: `<path d="M4 5h16v11H9l-5 4z"/>`,
	note: `<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>`,
	review: `<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>`,
	summary: `<path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3"/>`,
	details: `<path d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5v.5"/>`,
	buy: `<path d="M6 7h15l-2 9H8zM6 7L5 4H2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>`,
	bought: `<path d="M5 12l5 5L20 7"/>`,
	start: `<path d="M8 5v14l11-7z"/>`,
	give: `<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z"/>`,
	archive: `<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>`,
	up: `<path d="M6 15l6-6 6 6"/>`,
	down: `<path d="M6 9l6 6 6-6"/>`,
	hide: `<path d="M6 6l12 12M18 6L6 18"/>`,
};
const svg = (k: string) => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ACT_ICON[k]}</g></svg>`;

/**
 * A book's actions, decided by its status — the same wherever the book appears (Home, Buy list, My shelf,
 * Discover, its own page). Two buttons (the first solid), the rest under ⋯. Reordering is separate: rankControls.
 */
export function rowActions(s: ListedSource, o: RowOptions = {}): { html: string; help: HelpKey[] } {
	const back = esc(o.back ?? "/");
	const by = s.authors[0] ? ` by ${s.authors[0]}` : "";
	const help: HelpKey[] = [];
	type Act = (cls: string) => string;
	const link = (href: string, label: string, key: HelpKey, ext = false): Act => (cls) => (
		help.push(key), `<a class="${cls}" href="${esc(href)}"${ext ? ` target="_blank" rel="noopener"` : ""}${tip(key)}>${esc(label)}</a>`
	);
	const form = (action: string, label: string, key: HelpKey, fields = ""): Act => (cls) => (
		help.push(key), `<form method="post" action="/book/${s.id}/${action}"><input type="hidden" name="back" value="${back}">${fields}<button class="${cls}"${tip(key)}>${esc(label)}</button></form>`
	);
	const backQ = encodeURIComponent(o.back ?? "/");
	const summary = s.summary_id ? link(`/summary/${s.summary_id}`, "Read summary", "readSummary") : link(claudeLink(`/book-summary ${s.title}${by}`), "Summary", "summary", true);
	const details = s.has_card ? null : link(claudeLink(`/book-details ${s.title}${by}`), "Details", "fullDetails", true);
	const discuss = link(claudeLink(`/book-discuss ${s.title}${by} — load my notes and past discussions, then ask me which chapter or topic.`), "Discuss", "discuss", true);
	const note = link(`/book/${s.id}?focus=note#notes`, "Add a note", "note");
	const archive = link(`/book/${s.id}/archive?back=${backQ}`, "Archive", "archive");
	// Book Quiz sits under ⋯ in lists, never as a button (the book page shows it in its quiet links instead).
	const quiz = !o.inline && isQuizzable(s) && s.library_status !== "archived" ? link(claudeLink(`/book-quiz ${s.title}${by}`), s.quiz_score != null ? "Retake quiz" : "Quiz me", "quiz", true) : null;

	let main: (Act | null)[] = [];
	let extra: (Act | null)[] = [];
	switch (s.library_status) {
		case "none":
			// Idea only: the summary is the way in, so it leads.
			if (s.verdict === "idea_only") {
				main = [summary, form("buy", "Add to buy list", "buy")];
				extra = [details, archive];
			} else {
				main = [form("buy", "Add to buy list", "buy"), summary];
				extra = [details, archive];
			}
			break;
		case "want_to_buy":
			main = [link(`/book/${s.id}/bought?back=${backQ}`, "Bought", "bought"), summary];
			extra = [archive];
			break;
		case "own":
			main = [form("status", "Start reading", "startReading", `<input type="hidden" name="event" value="note_added">`), summary];
			extra = [note, archive];
			break;
		// Notes are the everyday action; Discuss is for the occasional complex book, so it never leads.
		case "reading":
			main = [note, discuss];
			extra = [link(`/book/${s.id}#review`, "Finish & review", "finish")];
			break;
		case "finished":
			main = s.has_review ? [note, link(`/book/${s.id}?edit_review=1#review`, "Edit review", "editReview")] : [link(`/book/${s.id}#review`, "Review", "review"), note];
			extra = [discuss];
			break;
		case "archived":
			main = s.summary_id ? [summary] : [];
			extra = [form("status", "Move back to Discover", "unarchive", `<input type="hidden" name="status" value="none">`)];
			break;
	}
	const buttons = main.filter((a): a is Act => Boolean(a)).map((a, i) => a(i === 0 ? "act primary" : "act"));
	const rest = [...extra, quiz].filter((a): a is Act => Boolean(a));
	// On the book page there's room, so everything shows as buttons; in lists the rest sit under ⋯.
	const more = !rest.length ? ""
		: o.inline ? rest.map((a) => a("act")).join("")
		: `<details class="more-menu"><summary class="act" aria-label="More actions" title="More actions">⋯</summary><div class="menu">${rest.map((a) => a("menu-item")).join("")}</div></details>`;
	return { html: buttons.join("") + more, help };
}

/** Buy list order: rank plus up/down, in its own column — never mixed in with the book's actions. */
function rankControls(s: ListedSource, back: string) {
	const move = (dir: "up" | "down", key: HelpKey) =>
		`<form method="post" action="/book/${s.id}/move"><input type="hidden" name="back" value="${esc(back)}"><input type="hidden" name="dir" value="${dir}"><button${tip(key)} aria-label="${esc(HELP[key][0])}">${svg(dir)}</button></form>`;
	return `<div class="rank"><b>${s.buy_rank ?? ""}</b>${move("up", "moveUp")}${move("down", "moveDown")}</div>`;
}

/** One book in a list: title, author, spoiler-free one-liner, tags — plus its actions. */
export function bookRow(s: ListedSource, o: RowOptions = {}) {
	// A tag that just repeats the type or kind ("fiction" next to Fiction) is noise.
	const shown = new Set([s.type, s.type && TYPE_LABEL[s.type].toLowerCase(), s.type === "nonfiction" && "non fiction", s.kind !== "book" && KIND_LABEL[s.kind].toLowerCase()].filter(Boolean));
	const topicTags = s.tags.filter((t) => !shown.has(t));
	const tags = [
		s.most_featured ? `<span class="tag star">★ Most featured</span>` : "",
		statusBadge(s),
		s.verdict ? `<span class="tag buy">Verdict: ${esc(verdictText(s.verdict))}</span>` : "",
		s.timeless && s.timeless !== "not_applicable" ? `<span class="tag${s.timeless === "yes" ? " ok" : ""}">${TIMELESS_LABEL[s.timeless] ?? esc(s.timeless)}</span>` : "",
		s.quality != null ? `<span class="tag topic">Quality ${esc(qualityText(s.quality, s.quality_tier))}</span>` : "",
		s.fit != null ? `<span class="tag live">Fit ${esc(fitText(s.fit, s.fit_label))}</span>` : "",
		s.quiz_score != null ? `<span class="tag">You know ${esc(String(s.quiz_score))}/10</span>` : "",
		s.kind !== "book" ? `<span class="tag">${KIND_LABEL[s.kind]}</span>` : "",
		s.type ? `<span class="tag">${TYPE_LABEL[s.type]}</span>` : "",
		s.rating != null ? `<span class="tag">★ ${s.rating}/10</span>` : "",
		s.appearance_count ? `<span class="tag">Featured ${s.appearance_count}×</span>` : "",
		// Plain labels: a link inside the row's own link is invalid HTML and breaks the layout.
		...topicTags.map((t) => `<span class="tag topic">${esc(t)}</span>`),
	].join("");
	const actions = rowActions(s, o).html;
	const ranked = o.reorder && s.library_status === "want_to_buy";
	const dismiss = o.hideFeatured
		? `<form method="post" action="/book/${s.id}/hide-featured" class="dismiss"><input type="hidden" name="back" value="${esc(o.back ?? "/")}"><button${tip("hideFeatured")} aria-label="Hide from this section">${svg("hide")}</button></form>`
		: "";
	return `<li class="book${dismiss ? " dismissable" : ""}">${dismiss}${ranked ? rankControls(s, o.back ?? "/buy") : ""}<a class="row" href="/book/${s.id}">${cover(s, "thumb")}<span class="row-text">
  <strong>${!ranked && s.library_status === "want_to_buy" && s.buy_rank ? `${s.buy_rank}. ` : ""}${esc(s.title)}</strong>
  <span class="muted">${esc(s.authors.join(", ") || "Author unknown")}${s.year ? ` · ${yearText(s.year)}` : ""}${o.price ? ` · ${esc(o.price)}` : ""}${s.library_status === "want_to_buy" && s.buy_format ? ` · prefer ${esc(BUY_FORMAT_LABEL[s.buy_format as BuyFormat])}` : ""}</span>
  ${s.one_liner ? `<span class="one-liner">${esc(s.one_liner)}</span>` : ""}
  ${o.verdictNote && verdictChangedSinceListed(s) ? `<span class="warn-line">Verdict now ${esc(verdictText(s.verdict))}${s.verdict_why ? `: ${esc(s.verdict_why)}` : ""}</span>` : ""}
  <span class="tags">${tags}</span></span></a>${actions ? `<div class="row-actions">${actions}</div>` : ""}</li>`;
}

/** On the Buy list: the Verdict moved away from reading after the book was added. The book itself never moves. */
function verdictChangedSinceListed(s: ListedSource) {
	return s.library_status === "want_to_buy" && !!s.verdict && !["read", "read_parts", "reread"].includes(s.verdict) && !!s.verdict_at && (!s.status_changed_at || s.verdict_at > s.status_changed_at);
}

export function list(rows: string[], empty: string) {
	return rows.length ? `<ul class="cards">${rows.join("")}</ul>` : `<p class="empty">${empty}</p>`;
}

export function pager(base: string, page: number, hasMore: boolean) {
	if (page <= 1 && !hasMore) return "";
	const sep = base.includes("?") ? "&" : "?";
	return `<nav class="pager">${page > 1 ? `<a href="${base}${sep}page=${page - 1}">← Newer</a>` : "<span></span>"}<span class="muted">Page ${page}</span>${hasMore ? `<a href="${base}${sep}page=${page + 1}">Older →</a>` : "<span></span>"}</nav>`;
}

export function featureLabel(f: string) {
	return ({ recs: "Recommendations", details: "Book details", discuss: "Discussion", summary: "Summary", shelf: "Shelf", store: "Book store", giveaway: "Give away", checkin: "Check-in" } as Record<string, string>)[f] ?? f;
}

export function originLabel(o: string) {
	return ({ recommended: "recommended by Claude", list_article: "found in a list", lookup: "you asked about it", checkin: "check-in pick", store: "book store pick" } as Record<string, string>)[o] ?? o;
}

export function sourceLabel(src: string | null) {
	return ({ openlibrary: "Open Library", "claude-web": "Claude, web search", "claude-memory": "Claude, from memory", user: "you" } as Record<string, string>)[src ?? ""] ?? src ?? "unknown";
}

export const safeBack = (v: unknown, fallback = "/") => (typeof v === "string" && /^\/[a-z0-9/?=&%_.-]*$/i.test(v) && !v.startsWith("//") ? v : fallback);

// ---- Page shell --------------------------------------------------------------

export type Tab = "home" | "buy" | "shelf" | "discover" | "notes" | "more";

const LOGO = `<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#17181b"/><path d="M8 9.5c2.8-1 5.5-.8 8 .9v13c-2.5-1.6-5.2-1.9-8-.9z" fill="#fff"/><path d="M24 9.5c-2.8-1-5.5-.8-8 .9v13c2.5-1.6 5.2-1.9 8-.9z" fill="#c9cad0"/></svg>`;

const NAV_ICON: Record<Tab, string> = {
	home: `<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>`,
	buy: `<path d="M6 7h15l-2 9H8zM6 7L5 4H2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z"/>`,
	shelf: `<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 14-4-1z"/>`,
	discover: `<path d="M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z"/>`, // a compass: the magnifier is search
	notes: `<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>`,
	more: `<path d="M5 12h.01M12 12h.01M19 12h.01"/>`,
};

/**
 * Every page: logo + tabs, then a page header — title on the left, that page's actions on the right (one
 * primary, the rest secondary) — then the body.
 */
export function layout(c: HubContext, active: Tab | null, title: string, body: string, opts: { h1?: boolean; actions?: string; search?: boolean } = {}) {
	// A book's life left to right, with Home in the centre; the rest lives behind the ☰ menu.
	const tabs: [Tab, string, string][] = [
		["discover", "/discover", "Discover"],
		["buy", "/buy", "Buy list"],
		["home", "/", "Home"],
		["shelf", "/shelf", "My shelf"],
		["notes", "/notes", "Notes"],
	];
	const nav = tabs
		.map(
			([k, href, label]) =>
				`<a href="${href}"${k === active ? ` aria-current="page"` : ""}${k === "home" ? ` class="home-tab"` : ""}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${NAV_ICON[k]}</g></svg><span>${label}</span></a>`,
		)
		.join("");
	return page(
		title === "Home" ? "Book Hub" : `${title} · Book Hub`,
		`<header class="top"><a class="brand" href="/">${LOGO}<span>Book Hub</span></a><nav class="tabs">${nav}</nav>
<div class="top-icons"><a class="search-button" href="/search" aria-label="Search your books" title="Search your books (press /)"${opts.search ? ` aria-current="page"` : ""}><svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true"><path d="M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a>
<a class="menu-button" href="/more" aria-label="Profile and settings" title="Profile & settings"${active === "more" ? ` aria-current="page"` : ""}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></a></div>
${opts.search ? "" : `<form class="searchbar" method="get" action="/search" role="search" hidden><input type="search" name="q" placeholder="Search your books: title, author, tag…" aria-label="Search your books" autocomplete="off"><button class="btn">Search</button></form>`}</header>
<main>${opts.h1 === false ? "" : `<div class="page-head"><h1>${esc(title)}</h1>${opts.actions ? `<div class="page-actions">${opts.actions}</div>` : ""}</div>`}${body}</main>`,
		c.get("aiApp") ?? "claude",
	);
}

export function page(title: string, body: string, aiApp: AiApp = "claude") {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="robots" content="noindex"><meta name="theme-color" content="#ffffff">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO.replace('width="28" height="28" ', 'xmlns="http://www.w3.org/2000/svg" '))}">
<style>${CSS}</style></head><body data-ai="${aiApp}">${body}<script>${MENUS_JS}${SEARCH_JS}${AI_JS}</script></body></html>`;
}

// Search: the 🔍 in the top bar opens a search field under it (no JS: it goes to the search page). "/" opens it too.
const SEARCH_JS = `(()=>{const b=document.querySelector(".search-button"),f=document.querySelector(".searchbar");if(!b||!f)return;const i=f.querySelector("input");
const open=()=>{f.hidden=false;b.setAttribute("aria-expanded","true");i.focus()};const close=()=>{f.hidden=true;b.setAttribute("aria-expanded","false")};
b.addEventListener("click",(e)=>{e.preventDefault();f.hidden?open():close()});
i.addEventListener("keydown",(e)=>{if(e.key==="Escape")close()});
document.addEventListener("keydown",(e)=>{if(e.key!=="/"||e.metaKey||e.ctrlKey||e.altKey)return;const t=e.target;if(t.closest&&t.closest("input,textarea,select,[contenteditable]"))return;e.preventDefault();open()});})();`;

// Dropdowns (filters, ⋯ menus): one open at a time; click outside or Esc closes them.
const MENUS_JS = `const ds=()=>[...document.querySelectorAll("details.multi,details.more-menu")];
document.addEventListener("toggle",(e)=>{const m=e.target;if(m.open&&m.matches&&m.matches("details.multi,details.more-menu"))ds().forEach((o)=>{if(o!==m)o.open=false})},true);
document.addEventListener("click",(e)=>{if(!e.target.closest("details.multi,details.more-menu"))ds().forEach((m)=>(m.open=false))});
document.addEventListener("keydown",(e)=>{if(e.key==="Escape")ds().forEach((m)=>(m.open=false))});`;

const CSS = `
:root{--ink:#17181b;--muted:#6b6f78;--line:#ececee;--soft:#f5f5f6;--accent:#17181b;--edge:#d9d9dd;--ok:#137a3a;--danger:#b42318;--star:#9a6700;--live:#7a3ad6}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
a{color:var(--ink);text-decoration-color:#b9bbc1;text-underline-offset:2px}h1{font-size:1.45rem;line-height:1.25;margin:8px 0 12px}h2{font-size:1.05rem;margin:0 0 10px}h3{font-size:1rem;margin:16px 0 8px}
.top{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:20px;padding:8px max(16px,calc((100% - 900px)/2))}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:1.05rem;color:var(--ink);text-decoration:none;white-space:nowrap;padding-right:20px;border-right:1px solid var(--line)}
.tabs{display:flex;gap:2px;flex:1}
.top-icons{margin-left:auto;display:flex;align-items:center;gap:4px}.search-button{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;color:var(--ink)}.search-button:hover,.search-button[aria-current],.search-button[aria-expanded="true"]{background:var(--soft)}
.top{flex-wrap:wrap;row-gap:6px}.searchbar{flex:1 0 100%;display:flex;gap:8px;padding:2px 0 6px}[hidden]{display:none!important}.searchbar input{flex:1;min-width:0}
.menu-button{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;color:var(--ink)}.menu-button:hover,.menu-button[aria-current]{background:var(--soft)}.tabs a{display:flex;align-items:center;gap:6px;text-decoration:none;color:var(--muted);padding:6px 10px;border-radius:8px;white-space:nowrap}
.tabs a[aria-current]{background:var(--soft);color:var(--ink);font-weight:600}.tabs svg{display:none}
main{max-width:900px;margin:0 auto;padding:12px 16px 96px}
.muted{color:var(--muted);font-size:.9rem;font-weight:400}.empty{padding:20px;background:var(--soft);border-radius:12px;color:var(--muted)}
.search,.filters{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.search input{flex:1 1 220px}
input,select,textarea{font:inherit;padding:9px 10px;border:1px solid var(--edge);border-radius:6px;background:#fff;min-width:0;max-width:100%}
textarea{width:100%}.filters input[type=search]{flex:2 1 220px}.filters select{flex:1 1 130px}.check{display:flex;align-items:center;gap:6px;white-space:nowrap}
.btn{display:inline-block;background:var(--accent);color:#fff;border:1px solid var(--accent);border-radius:6px;padding:8px 14px;font:inherit;font-size:.95rem;font-weight:600;text-decoration:none;cursor:pointer;text-align:center}.btn:hover{background:#000}.btn.secondary:hover{background:var(--soft)}
.btn.secondary{background:#fff;color:var(--ink);border-color:var(--edge)}.btn.small{padding:4px 10px;font-size:.85rem}.danger-btn{background:var(--danger);border-color:var(--danger)}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}
.segmented{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}.segmented a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--muted);font-size:.9rem}.segmented a[aria-current]{background:var(--ink);color:#fff;border-color:var(--ink)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0}
.stats a{display:flex;flex-direction:column;padding:12px 14px;border:1px solid var(--line);border-radius:12px;text-decoration:none;color:var(--ink)}.stats strong{font-size:1.4rem}.stats span{color:var(--muted);font-size:.85rem}
.cards{list-style:none;padding:0;margin:0}.book{position:relative;display:flex;align-items:stretch;border-bottom:1px solid var(--line)}.book:last-child{border-bottom:0}
.dismiss{position:absolute;top:6px;right:0;margin:0;z-index:1}.dismiss button{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:999px;background:none;color:var(--muted);cursor:pointer}.dismiss button:hover{background:var(--soft);color:var(--ink)}
.dismissable .row{padding-right:34px}
.row{flex:1;display:flex;gap:12px;align-items:flex-start;padding:10px 4px;color:inherit;text-decoration:none;min-width:0}.row:hover{background:var(--soft)}
.row-text{display:flex;flex-direction:column;min-width:0;gap:1px}.row-text strong{overflow-wrap:anywhere}
.one-liner{font-size:.92rem;color:#333}.came-up{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;font-size:.82rem}
.row-actions{flex:none;display:flex;align-items:center;gap:6px;padding:10px 0 10px 14px}.row-actions form{margin:0}
.act{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:6px 12px;border:1px solid var(--edge);border-radius:6px;background:#fff;color:var(--ink);font:inherit;font-size:.84rem;font-weight:600;line-height:1.2;text-decoration:none;cursor:pointer;white-space:nowrap}
.act:hover{background:var(--soft)}.act.primary{background:var(--ink);border-color:var(--ink);color:#fff}.act.primary:hover{background:#000}
details.more-menu{position:relative;border:0;padding:0}.more-menu summary{list-style:none;border-color:transparent;color:var(--muted);font-size:1rem;padding:6px 9px}.more-menu summary::-webkit-details-marker{display:none}.more-menu[open] summary{background:var(--soft)}
.more-menu .menu{position:absolute;right:0;top:calc(100% + 4px);z-index:6;min-width:180px;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:4px;display:flex;flex-direction:column}.more-menu form{margin:0}
.menu-item{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:5px;background:none;color:var(--ink);font:inherit;font-size:.9rem;text-decoration:none;cursor:pointer;white-space:nowrap}.menu-item:hover{background:var(--soft)}
.rank{flex:none;width:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 0}.rank b{font-size:.95rem}.rank form{margin:0}
.rank button{display:flex;align-items:center;justify-content:center;width:26px;height:22px;border:1px solid var(--line);border-radius:5px;background:#fff;color:var(--muted);cursor:pointer}.rank button:hover{background:var(--soft);color:var(--ink)}.rank svg{width:14px;height:14px}
.store-panel{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;background:var(--soft);border-radius:8px;padding:12px 14px;margin:4px 0 14px}.store-panel>div:first-child{flex:1 1 260px;display:flex;flex-direction:column}.store-btns{display:flex;flex-wrap:wrap;gap:8px}
@media (max-width:640px){.book{flex-wrap:wrap}.row-actions{flex:1 0 100%;justify-content:flex-end;padding:0 4px 10px}.store-btns{width:100%;flex-direction:column}}
.icon{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:8px;background:none;color:var(--muted);cursor:pointer}.icon:hover{background:var(--soft);color:var(--ink)}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.tag{font-size:.76rem;padding:1px 8px;border-radius:999px;background:var(--soft);color:var(--muted);text-decoration:none}
.tag.ok{background:#e8f5ec;color:var(--ok)}.tag.star{background:#fff4d6;color:var(--star)}.tag.live{background:#f1e9fd;color:var(--live)}.tag.buy{background:#eceef2;color:var(--ink)}.tag.topic{background:#fff;border:1px solid var(--line)}.tag.muted-tag{background:#f0f0f0;color:#888}
.cover{flex:none;border-radius:4px;object-fit:cover;background:var(--soft);display:inline-flex;align-items:center;justify-content:center;color:var(--muted);font-weight:700}
.cover.thumb{width:40px;height:60px}.cover.large{width:110px;height:165px;font-size:2rem}
.book-head{display:flex;gap:18px;align-items:flex-start;margin:8px 0 16px}
.facts{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:10px 0 0}.facts dt{color:var(--muted)}.facts dd{margin:0}
.panel{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:14px 0}.panel h2 a{font-size:.85rem;font-weight:400;margin-left:8px}
.stack{display:flex;flex-direction:column;gap:10px}.inline-fields{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.choice{display:flex;gap:6px;align-items:center}.choice.opt{align-items:flex-start;gap:8px}.choice.opt input{margin-top:6px;flex:none}
.note{border-top:1px solid var(--line);padding:10px 0}.pre{white-space:pre-wrap;overflow-wrap:anywhere}
.inline{display:inline}.link{background:none;border:0;padding:0;font:inherit;cursor:pointer;color:var(--accent)}.danger{color:var(--danger)}
.plain{list-style:none;padding:0;margin:0}.plain li{padding:8px 0;border-bottom:1px solid var(--line)}.plain li:last-child{border-bottom:0}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.editor{font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;margin:8px 0}
details{border-top:1px solid var(--line);padding:8px 0}summary{cursor:pointer}details .pre{background:var(--soft);padding:10px;border-radius:8px;margin:8px 0;font-size:.9rem}
.notice{background:#e8f5ec;color:var(--ok);padding:8px 12px;border-radius:8px}.warn-line{font-size:.85rem;color:var(--star)}
.group{margin:18px 0}.group>h2{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.group>p{margin:-4px 0 8px}
.items{list-style:none;padding:0;margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}.items li+li{border-top:1px solid var(--line)}
.item{display:flex;align-items:center;gap:12px;padding:12px 14px;color:var(--ink);text-decoration:none}a.item:hover{background:var(--soft)}
.item .what{flex:1;min-width:0;display:flex;flex-direction:column}.item .tag{flex:none}.chev{flex:none;color:var(--muted)}
.group.danger .items{border-color:#f0c4bf}.group.danger>h2{color:var(--danger)}
.crumbs{font-size:.88rem;margin:4px 0 0;color:var(--muted)}.crumbs a{color:var(--muted)}.rule-head{margin:2px 0}.used{font-size:.88rem;color:var(--muted);margin:4px 0 10px}
.seg{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.seg a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--muted);font-size:.9rem}.seg a[aria-current]{background:var(--ink);color:#fff;border-color:var(--ink)}
.section-title{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:20px;border-top:1px solid var(--line);padding-top:14px}.section-title h2{margin:0}
.hint{font-size:.85rem;color:var(--muted);margin:4px 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.chip{position:relative;display:inline-flex;align-items:center;border:1px solid var(--edge);border-radius:999px;padding:4px 11px;font:inherit;font-size:.88rem;background:#fff;color:var(--ink);cursor:pointer}
.chip input{position:absolute;opacity:0;pointer-events:none}.chip:has(input:checked),.chip.tri[data-state="in"]{background:var(--ink);border-color:var(--ink);color:#fff}
.chip:has(input:focus-visible){outline:2px solid var(--ink);outline-offset:2px}.chip.tri[data-state="out"]{border-color:var(--danger);color:var(--danger);text-decoration:line-through}
.add-input{margin:4px 0 0;width:min(100%,360px)}.profile-form textarea{margin-top:2px}.profile-form select{margin:4px 0}
.weights{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) 72px;gap:8px 12px;align-items:center;margin:8px 0}.weights .name{font-weight:600}.weights input{width:72px;text-align:center}
@media (max-width:560px){.weights{grid-template-columns:minmax(0,1fr) 72px}.weights .muted{display:none}}
.strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:4px 0 12px}
.cell{border:1px solid var(--line);border-radius:10px;padding:9px 10px;display:flex;flex-direction:column;gap:2px;min-width:0}
.cell .k{font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}.cell .v{font-weight:700;font-size:1rem;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.cell .why{font-size:.8rem;color:var(--muted);line-height:1.35;overflow-wrap:anywhere}
.cell.verdict{border-color:var(--ink)}
@media (max-width:700px){.strip{grid-template-columns:repeat(2,minmax(0,1fr))}.cell.verdict{grid-column:1/-1;order:-1}}
.factors{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:4px;font-variant-numeric:tabular-nums}.factors div{background:var(--soft);border-radius:6px;padding:4px 8px;font-size:.8rem;display:flex;justify-content:space-between;gap:6px}
.verdict-form{margin-top:12px}
.setup{border:1px solid var(--edge);border-radius:12px;padding:14px 16px;margin:12px 0}.setup-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.setup-head h2{margin:0}
.setup ol{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-direction:column;gap:8px}.setup li{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;background:var(--soft)}
.setup .num{flex:none;width:26px;height:26px;border-radius:999px;border:1px solid var(--edge);background:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:700}
.setup li.done .num{background:var(--ok);border-color:var(--ok);color:#fff}.setup .what{flex:1;min-width:0;display:flex;flex-direction:column}
.progress{height:6px;border-radius:999px;background:var(--soft);overflow:hidden;margin:8px 0 0}.progress span{display:block;height:100%;background:var(--ok)}
.pointer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;background:var(--soft);border-radius:10px;padding:10px 14px;margin:6px 0 10px}.pointer p{margin:0;flex:1 1 260px}.pointer-btns{display:flex;gap:6px}.pointer-btns form{margin:0}
.notice-line{background:#fff4d6;color:var(--star);padding:8px 12px;border-radius:8px;font-size:.92rem}.notice-line a{color:var(--star)}.warn{background:#fff4d6;color:var(--star);padding:8px 12px;border-radius:8px}
.md{overflow-wrap:anywhere}.card-md p{margin:0 0 10px}.md h2,.md h3,.md h4,.md h5{margin:18px 0 8px}.md ul,.md ol{padding-left:1.3rem}.md li.sub{margin-left:1rem}
.md blockquote{margin:10px 0;padding:6px 12px;border-left:3px solid var(--line);color:#444}.md pre{background:var(--soft);padding:10px;border-radius:8px;overflow-x:auto}
.table-wrap{overflow-x:auto;margin:8px 0}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--soft)}
code{background:var(--soft);padding:1px 5px;border-radius:4px;font-size:.88em;overflow-wrap:anywhere}
.book-actions .row-actions{flex-wrap:wrap;justify-content:flex-start;padding:0;margin:8px 0 0}.book-actions p{margin:0}
.more-actions{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);font-size:.9rem}.more-actions form{display:inline;margin:0}
.more-actions a,.more-actions button{background:none;border:0;padding:0;font:inherit;color:var(--muted);cursor:pointer;text-decoration:none}.more-actions a:hover,.more-actions button:hover{text-decoration:underline}
.review-form label.field{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:.92rem}.review-form label.field textarea,.review-form label.field input{font-weight:400}
.page-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;margin:14px 0 10px}.page-head h1{margin:0}
.page-actions{display:flex;flex-wrap:wrap;gap:8px}
.multi{position:relative;border:0;padding:0;flex:0 1 auto}.multi summary{list-style:none;padding:9px 12px;border:1px solid #cfcfcf;border-radius:8px;background:#fff;cursor:pointer;white-space:nowrap}
.multi summary::-webkit-details-marker{display:none}.multi summary::after{content:" ▾";color:var(--muted)}.multi[open] summary{border-color:var(--accent)}
.multi .count{display:inline-block;min-width:1.3em;padding:0 5px;border-radius:999px;background:var(--accent);color:#fff;font-size:.75rem;text-align:center}
.multi-options{position:absolute;z-index:5;top:calc(100% + 4px);left:0;min-width:220px;max-height:320px;overflow:auto;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.toast{position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--ink);color:#fff;padding:10px 16px;border-radius:8px;font-size:.9rem;z-index:20}
.pager{display:flex;justify-content:space-between;align-items:center;margin:12px 0}
[title]{cursor:help}a[title],button[title]{cursor:pointer}
.commands td:first-child{white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:.85rem}
@media (max-width:640px){
 .top{padding:8px 16px}.brand{border-right:0;padding-right:0}
 .tabs{position:fixed;bottom:0;left:0;right:0;justify-content:space-around;background:#fff;border-top:1px solid var(--line);padding:4px 2px calc(4px + env(safe-area-inset-bottom));z-index:3}
 .tabs a{flex-direction:column;gap:2px;padding:4px 2px;font-size:.68rem;flex:1;justify-content:center}.tabs a[aria-current]{background:none;color:var(--accent)}.tabs svg{display:block}
 .tabs a.home-tab svg{width:26px;height:26px}.tabs a.home-tab{font-weight:600}
 .cover.large{width:84px;height:126px}.book-head{gap:12px}
}`;
