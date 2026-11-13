// Book page and every action on a book: status, Buy list, bought, archive, give away, notes, review, tags,
// merge, delete — plus "Add a book" (Open Library lookup, no Claude needed).

import { Hono } from "hono";
import {
	addNote,
	deleteNote,
	deleteSource,
	getAppearances,
	getCurrency,
	getSource,
	listDiscussions,
	listSummaries,
	mergeSources,
	saveSource,
	setVerdict,
	unlockVerdict,
	VERDICTS,
	VERDICT_HOWS,
	type SourceDetail,
	type Verdict,
} from "../db";
import { applyStatusEvent, moveOnBuyList, removeTag, REVIEW_SECTIONS, reviewFromMarkdown, reviewToMarkdown, saveReview, saveTags, setHiddenFromFeatured, setStatus } from "../library";
import { CURRENCIES, isCurrency, showMoney } from "../currency";
import { renderMarkdown } from "../markdown";

const toCurrency = (v: string | null) => (isCurrency(v) ? v : null);
import { lookupBook } from "../openlibrary";
import { ARCHIVE_LABEL, ARCHIVE_REASONS, BUY_FORMAT_LABEL, BUY_FORMATS, STATUSES, toStatus, type ArchiveReason, type BuyFormat } from "../status";
import {
	askButton,
	claudeLink,
	cover,
	esc,
	rowActions,
	featureLabel,
	fitText,
	HOW_LABEL,
	isQuizzable,
	QUIZ_OUTCOME_LABEL,
	KIND_LABEL,
	qualityText,
	VERDICT_LABEL,
	verdictText,
	layout,
	originLabel,
	safeBack,
	sourceLabel,
	STATUS_LABEL,
	statusBadge,
	statusLabel,
	tip,
	TIMELESS_LABEL,
	TYPE_LABEL,
	yearText,
	type HelpKey,
	type HubContext,
	type HubEnv,
} from "./ui";

export const book = new Hono<HubEnv>();

const num = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? undefined : Number(String(v).replace(/[^\d.]/g, "")) || undefined);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const notFound = (c: HubContext, id: number) => c.html(layout(c, "discover", "Not found", `<p>No book #${id}. <a href="/discover">Back</a></p>`), 404);

// ---- Book page ---------------------------------------------------------------

book.get("/book/:id", async (c) => {
	const db = c.env.DB;
	const id = Number(c.req.param("id"));
	const s = await getSource(db, id);
	if (!s) return notFound(c, id);
	const [appearances, discussions, summaries, currency] = await Promise.all([getAppearances(db, id), listDiscussions(db, { sourceId: id, limit: 50 }), listSummaries(db, { sourceId: id, limit: 20 }), getCurrency(db)]);
	const by = s.authors[0] ? ` by ${s.authors[0]}` : "";
	const card = s.research.card;
	const tab = s.library_status === "want_to_buy" ? "buy" : ["own", "reading", "finished", "given_away"].includes(s.library_status) ? "shelf" : "discover";
	const back = encodeURIComponent(`/book/${id}`);

	return c.html(
		layout(c, tab, s.title, `
<div class="book-head">
  ${cover(s, "large")}
  <div>
    <h1>${esc(s.title)}</h1>
    ${s.subtitle ? `<p class="muted">${esc(s.subtitle)}</p>` : ""}
    <p>${esc(s.authors.join(", ") || "Author unknown")}</p>
    ${s.one_liner ? `<p class="one-liner">${esc(s.one_liner)}</p>` : ""}
    <div class="tags">${s.most_featured ? `<span class="tag star">★ Most featured</span>` : ""}${statusBadge(s)}${s.rating != null ? `<span class="tag">★ ${s.rating}/10</span>` : ""}</div>
    <dl class="facts">
      <dt>Kind</dt><dd>${KIND_LABEL[s.kind]}${s.type ? ` · ${TYPE_LABEL[s.type]}` : ""}${s.is_textbook ? " · Textbook" : ""}</dd>
      <dt>Year</dt><dd>${s.year ? `${yearText(s.year)}${s.year_source ? ` <small class="muted">(${esc(sourceLabel(s.year_source))})</small>` : ""}` : "—"}</dd>
      <dt>Pages</dt><dd>${s.pages ? `${s.pages}${s.pages_source ? ` <small class="muted">(${esc(sourceLabel(s.pages_source))})</small>` : ""}` : "—"}</dd>
      ${s.url ? `<dt>Link</dt><dd><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open</a></dd>` : ""}
      <dt>Featured</dt><dd>${s.appearance_count ? `${s.appearance_count}× in recommendations or lists` : "Not yet"}</dd>
      ${s.came_up_for ? `<dt>Came up for</dt><dd class="muted">${esc(s.came_up_for)}</dd>` : ""}
    </dl>
  </div>
</div>

${scoreStrip(s)}

${actionsPanel(s)}

${s.series ? `<section class="panel"><h2>Series: ${esc(s.series.name)}</h2><ol class="plain">${s.series.books
			.map((b) => `<li>${b.position}. ${b.source_id && b.source_id !== s.id ? `<a href="/book/${b.source_id}">${esc(b.title)}</a>` : b.source_id === s.id ? `<strong>${esc(b.title)}</strong> <span class="muted">(this book)</span>` : esc(b.title)}</li>`)
			.join("")}</ol><p class="muted">Other books in the series are listed by name only; they're not added to your lists.</p></section>` : ""}



${reviewPanel(s)}

<section class="panel" id="notes">
  <h2>My notes <span class="muted">(${s.notes.length})</span></h2>
  <form method="post" action="/book/${id}/notes" class="stack">
    <textarea name="text" rows="3" placeholder="A thought, a line you liked, a question… (the microphone key works)" required${c.req.query("focus") === "note" ? " autofocus" : ""}></textarea>
    <div class="inline-fields"><input name="locator" placeholder="Chapter or page (optional)" style="flex:1 1 180px"><button class="btn"${tip("addNote")}>Add note</button></div>
    ${["none", "want_to_buy", "own"].includes(s.library_status) ? `<p class="muted">Adding a note marks this book as Reading.</p>` : ""}
  </form>
  ${s.notes.map((n) => `<div class="note"><div class="pre">${esc(n.text)}</div><div class="muted">${n.locator ? `${esc(n.locator)} · ` : ""}${esc(n.created_at.slice(0, 10))}
    <form method="post" action="/book/${id}/notes/${n.id}/delete" class="inline" onsubmit="return confirm('Delete this note?')"><button class="link danger">Delete</button></form></div></div>`).join("")}
</section>

<section class="panel">
  <h2>Card</h2>
  ${card ? `<p class="muted">Saved ${esc(card.updated_at.slice(0, 10))} (${card.age_days} days ago)${card.confidence ? ` · confidence ${esc(card.confidence)}` : ""}</p><div class="md card-md">${renderMarkdown(cardMarkdown(card.markdown))}</div>` : `<p class="muted">No card yet. Tap “Full details” to have Claude research it.</p>`}
  ${s.research.facts.length ? `<h3>Researched facts</h3><div class="table-wrap"><table><thead><tr><th>Fact</th><th>Value</th><th>Checked</th></tr></thead><tbody>${s.research.facts
				.map((f: any) => `<tr><td>${esc(f.field.replace(/_/g, " "))}</td><td>${f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener noreferrer">${esc(f.value)}</a>` : esc(f.value)}${f.note ? `<div class="muted">${esc(f.note)}</div>` : ""}</td><td class="muted">${f.age_days} days ago</td></tr>`)
				.join("")}</tbody></table></div>` : ""}
</section>

<section class="panel">
  <h2>Discussions <span class="muted">(${discussions.length})</span></h2>
  ${discussions.length ? `<ul class="plain">${discussions.map((d) => `<li><a href="/discussion/${d.id}">${esc(d.title)}</a> <span class="muted">${d.locator ? `· ${esc(d.locator)} ` : ""}· ${esc(d.updated_at.slice(0, 10))}</span></li>`).join("")}</ul>` : `<p class="muted">None saved yet.</p>`}
  <h2>Summaries <span class="muted">(${summaries.length})</span></h2>
  ${summaries.length ? `<ul class="plain">${summaries.map((m) => `<li><a href="/summary/${m.id}">Summary of ${esc(m.created_at.slice(0, 10))}</a> <span class="muted">· ${Math.round(m.body.split(/\s+/).length / 200)} min read</span></li>`).join("")}</ul>` : `<p class="muted">None yet.</p>`}
</section>

<section class="panel">
  <h2>Tags</h2>
  <div class="tags">${s.tags.map((t) => `<span class="tag topic">${esc(t)} <form method="post" action="/book/${id}/tags/remove" class="inline"><input type="hidden" name="tag" value="${esc(t)}"><button class="link" aria-label="Remove tag ${esc(t)}">✕</button></form></span>`).join("") || `<span class="muted">No tags yet.</span>`}</div>
  <form method="post" action="/book/${id}/tags" class="inline-fields" style="margin-top:8px"><input name="tag" placeholder="Add a tag, e.g. feel-good" maxlength="40" required><button class="btn secondary small">Add</button></form>
</section>

${s.editions.length ? `<section class="panel"><h2>Translations & editions</h2><ul class="plain">${s.editions
			.map((e: any) => `<li><strong>${esc(e.label)}</strong>${e.owned ? ` <span class="tag ok">I own this</span>` : ""}${e.translator ? `<div class="muted">Translator: ${esc(e.translator)}</div>` : ""}${e.publisher ? `<div class="muted">Publisher: ${esc(e.publisher)}</div>` : ""}${e.notes ? `<div class="muted">${esc(e.notes)}</div>` : ""}</li>`)
			.join("")}</ul></section>` : ""}

<section class="panel">
  <h2>History</h2>
  ${appearances.length ? `<ul class="plain">${appearances
			.map((a) => `<li><strong>${esc(featureLabel(a.feature))}</strong>${a.rank ? ` · rank ${a.rank}` : ""}${a.fit_score != null ? ` · fit ${a.fit_score}` : ""} <span class="muted">· ${esc(a.created_at.slice(0, 10))} · ${esc(originLabel(a.origin))}</span><div class="muted clamp">${esc(a.input)}</div></li>`)
			.join("")}</ul>` : `<p class="muted">Hasn't come up in any request yet.</p>`}
  ${s.aliases.length ? `<p class="muted">Also known as: ${s.aliases.map(esc).join(" · ")}</p>` : ""}
</section>

<details class="panel">
  <summary><strong>Change status or fix mistakes</strong></summary>
  <form method="post" action="/book/${id}/status" class="inline-fields" style="margin:10px 0">
    <select name="status" aria-label="Status">${STATUSES.map((st) => `<option value="${st}"${st === s.library_status ? " selected" : ""}>${STATUS_LABEL[st]}</option>`).join("")}</select>
    <button class="btn secondary"${tip("setStatus")}>Set status</button>
  </form>
  <form method="get" action="/book/${id}/merge" class="inline-fields">
    <label class="muted">Duplicate of book #<input type="number" name="into" min="1" required style="width:6em"></label>
    <button class="btn secondary"${tip("merge")}>Merge…</button>
  </form>
  <p><a href="/book/${id}/delete" class="danger"${tip("delete")}>Delete permanently…</a> <span class="muted">(removes its history too — Archive is usually better)</span></p>
</details>`, { h1: false }),
	);

	/**
	 * Same main actions as the book's row in any list (rowActions), then one quiet line of the rarer ones.
	 */
	/** Status · Verdict · Timeless · Quality · Fit, with the reasons one tap away. */
	function scoreStrip(s: SourceDetail) {
		const q = card?.quality ?? s.reference_score?.quality ?? null;
		const qWhy = card?.quality != null ? (card.confidence ? `Confidence: ${esc(card.confidence)}` : "") : s.reference_score ? "From your saved scores" : "Not scored yet";
		const timeless = card?.timeless && card.timeless !== "not_applicable" ? ({ yes: "Yes", no: "No", too_new_promising: "Too new: promising", too_new_not: "Too new: not" } as Record<string, string>)[card.timeless] ?? "—" : "—";
		const cell = (k: string, v: string, why: string, cls = "") => `<div class="cell${cls}"><span class="k">${k}</span><span class="v">${v || "—"}</span><span class="why">${why}</span></div>`;
		const factors = card?.quality_factors ? Object.entries(card.quality_factors) : [];
		const history = s.verdict_history;
		const verdictForm = `<form method="post" action="/book/${id}/verdict" class="inline-fields verdict-form">
  <label>My verdict <select name="verdict">${VERDICTS.map((v) => `<option value="${v}"${v === s.verdict ? " selected" : ""}>${VERDICT_LABEL[v]}</option>`).join("")}</select></label>
  <label>How <select name="how"><option value="">—</option>${VERDICT_HOWS.map((h) => `<option value="${h}"${h === s.verdict_how ? " selected" : ""}>${HOW_LABEL[h]}</option>`).join("")}</select></label>
  <input name="why" placeholder="Why (optional)" maxlength="300" value="${s.verdict_locked ? esc(s.verdict_why ?? "") : ""}" style="flex:1 1 200px">
  <button class="btn secondary small">🔒 Set my verdict</button></form>`;
		return `<section class="strip" aria-label="Scores">
${cell("Status", esc(statusLabel(s)), "You set this")}
${cell("Verdict", esc(verdictText(s.verdict, s.verdict_how)) || "Not decided", s.verdict_by === "quiz" ? `🔒 From your quiz${s.verdict_why ? `: ${esc(s.verdict_why)}` : ""}` : s.verdict_locked ? "🔒 Your verdict" : esc(s.verdict_why ?? (card ? "" : "Ask for details to get one")), " verdict")}
${cell("Timeless", esc(timeless), card?.timeless === "not_applicable" ? "Fiction" : "")}
${cell("Quality", esc(qualityText(q, card?.quality_tier ?? s.reference_score?.tier?.toLowerCase())), qWhy)}
${cell("Fit for you", esc(fitText(card?.fit, card?.fit_label)), esc(card?.fit_reason ?? ""))}
</section>
<details class="panel why-scores"><summary><strong>Why these scores</strong></summary>
${factors.length ? `<h3>Quality, factor by factor</h3><div class="factors">${factors.map(([k, v]) => `<div>${esc(k)}<b>${esc(String(v))}</b></div>`).join("")}</div>` : ""}
${s.reference_score && card?.quality == null ? `<p class="muted">From your saved scores: ${esc(String(s.reference_score.score))}${s.reference_score.tier ? ` · ${esc(s.reference_score.tier)}` : ""}${s.reference_score.factors ? ` · ${esc(s.reference_score.factors)}` : ""}</p>` : ""}
${card?.belief || s.reference_score?.belief ? `<p><strong>Belief it breaks:</strong> ${esc(card?.belief ?? s.reference_score?.belief ?? "")}</p>` : ""}
${card?.mistake || s.reference_score?.mistake ? `<p><strong>Mistake it prevents:</strong> ${esc(card?.mistake ?? s.reference_score?.mistake ?? "")}</p>` : ""}
${card?.critic ? `<p><strong>Strongest critic:</strong> ${esc(card.critic)}</p>` : ""}
${card?.fit_reason ? `<p><strong>Fit:</strong> ${esc(card.fit_reason)}</p>` : ""}
<h3>Verdict history</h3>
${history.length ? `<ul class="plain">${history.map((h) => `<li>${esc(verdictText(h.verdict, h.how))}${h.why ? ` <span class="muted">· ${esc(h.why)}</span>` : ""} <span class="muted">· ${h.set_by === "me" ? "you" : h.set_by === "quiz" ? "Book Quiz" : "your AI"} · ${esc(h.created_at.slice(0, 10))}</span></li>`).join("")}</ul>` : `<p class="muted">None yet.</p>`}
${verdictForm}
${s.verdict_locked ? `<form method="post" action="/book/${id}/verdict/unlock" class="actions"><button class="btn secondary small">Unlock: let my AI decide again</button></form>` : `<p class="muted">Setting your own verdict locks it: your AI can then only say if it disagrees. It never moves the book between your lists.</p>`}
</details>
${quizPanel(s)}`;
	}

	/** The latest Book Quiz (or the unfinished one), with earlier results underneath. */
	function quizPanel(s: SourceDetail) {
		const [latest, ...older] = s.quizzes;
		if (!latest) return "";
		const result = { held: "Held", known_not_lived: "Known, not lived", partly: "Partly", new: "New" } as Record<string, string>;
		const done = older.find((q) => !q.partial);
		return `<section class="panel" id="quiz"><h2>Book Quiz <span class="muted">· ${esc(latest.created_at.slice(0, 10))}</span></h2>
${latest.partial
		? `<p><strong>Unfinished</strong> · so far you already know ${esc(String(latest.score))}/10. <a href="${esc(claudeLink(`/book-quiz Continue my quiz on ${s.title}${by}`))}" target="_blank" rel="noopener">Continue in chat →</a></p>${done ? `<p class="muted">Last finished quiz: you already know ${esc(String(done.score))}/10 (${esc(done.created_at.slice(0, 10))}).</p>` : ""}`
		: `<p class="quiz-score">You already know: <strong>${esc(String(latest.score))}/10</strong>${latest.practice != null ? ` · practice ${esc(String(latest.practice))}/10` : ""} → ${esc(QUIZ_OUTCOME_LABEL[latest.outcome ?? "info"] ?? "")}${latest.verdict ? ` · ${esc(verdictText(latest.verdict))}` : ""}</p>`}
${latest.practice_tip ? `<p><strong>Practice:</strong> ${esc(latest.practice_tip)}</p>` : ""}
${latest.ideas.length ? `<div class="table-wrap"><table><thead><tr><th>Idea</th><th>You</th><th>In one line</th></tr></thead><tbody>${latest.ideas
			.map((i) => `<tr><td>${esc(i.idea)}${i.core ? ` <span class="tag">core</span>` : ""}${i.covered_by ? `<div class="muted">Covered by ${esc(i.covered_by)}</div>` : ""}</td><td>${esc(result[i.result] ?? i.result)}</td><td class="muted">${esc(i.note ?? "")}</td></tr>`)
			.join("")}</tbody></table></div>` : ""}
${latest.ideas_left.length ? `<p><strong>Ideas left for you:</strong> ${latest.ideas_left.map(esc).join(" · ")}</p>` : ""}
${latest.replacement ? `<p><strong>Instead:</strong> ${esc(latest.replacement)}</p>` : ""}
${latest.chapters ? `<p><strong>Chapters to read:</strong> ${esc(latest.chapters)}</p>` : ""}
${latest.summary ? `<details><summary>What the book holds (debrief)</summary><div class="md">${renderMarkdown(latest.summary)}</div></details>` : ""}
${older.length ? `<details><summary>Earlier quizzes (${older.length})</summary><ul class="plain">${older.map((q) => `<li>${q.partial ? "Unfinished · " : ""}You already know ${esc(String(q.score))}/10${q.verdict ? ` → ${esc(verdictText(q.verdict))}` : ""} <span class="muted">· ${esc(q.created_at.slice(0, 10))}</span></li>`).join("")}</ul></details>` : ""}
</section>`;
	}

	function actionsPanel(s: SourceDetail) {
		const st = s.library_status;
		const status =
			st === "archived" ? `Archived${s.archive_reason ? ` · ${ARCHIVE_LABEL[s.archive_reason as ArchiveReason]}` : ""} on ${esc(s.archived_on ?? "")}`
			: st === "given_away" ? `Given away ${esc(s.given_on ?? "")}${s.given_price != null ? ` for ${showMoney(s.given_price, toCurrency(s.given_currency), currency)}` : ""}`
			: st === "finished" ? (s.finished_on ? `Finished ${esc(s.finished_on)}` : "Finished — date unknown")
			: st === "want_to_buy" ? `On your Buy list (#${s.buy_rank ?? "?"})${s.buy_format ? ` · prefer ${BUY_FORMAT_LABEL[s.buy_format as BuyFormat]}` : ""}`
			: statusLabel(s);
		const paid = s.bought_price != null ? showMoney(s.bought_price, toCurrency(s.bought_currency), currency) : "";
		const how = [s.bought_format ? BUY_FORMAT_LABEL[s.bought_format as BuyFormat] : "", paid].filter(Boolean).join(", ");
		const bought = s.bought_on ? ` · bought ${esc(s.bought_on)}${how ? ` (${esc(how)})` : ""}` : "";
		const owned = s.owned_format ? ` · ${s.owned_format === "both" ? "physical + Kindle" : s.owned_format}` : "";
		const asListed = { ...s, has_card: Boolean(card), summary_id: summaries[0]?.id ?? null, has_review: Boolean(s.review), timeless: card?.timeless ?? null, buy: card?.buy ?? null, quality: card?.quality ?? null, fit: card?.fit ?? null, quiz_score: s.quizzes.find((q) => !q.partial)?.score ?? null } as any;
		const main = rowActions(asListed, { back: `/book/${id}`, inline: true }).html;
		const more = [
			main.includes("Details") ? "" : `<a href="${esc(claudeLink(`/book-details ${s.title}${by}${card ? " — refresh the saved research" : ""}`))}" target="_blank" rel="noopener"${tip(card ? "refreshDetails" : "fullDetails")}>${card ? "Refresh details" : "Full details"}</a>`,
			main.includes("ummary") ? "" : summaries.length ? `<a href="/summary/${summaries[0].id}"${tip("readSummary")}>Read summary</a>` : `<a href="${esc(claudeLink(`/book-summary ${s.title}${by}`))}" target="_blank" rel="noopener"${tip("summary")}>Long summary</a>`,
			isQuizzable(s) && st !== "archived"
				? s.quizzes[0]?.partial
					? `<a href="${esc(claudeLink(`/book-quiz Continue my quiz on ${s.title}${by}`))}" target="_blank" rel="noopener"${tip("quiz")}>Continue quiz</a>`
					: `<a href="${esc(claudeLink(`/book-quiz ${s.title}${by}`))}" target="_blank" rel="noopener"${tip("quiz")}>${s.quizzes.length ? "Retake quiz" : "Quiz me"}</a>`
				: "",
			main.includes("Discuss") || !["own", "finished", "given_away"].includes(st) ? "" : `<a href="${esc(claudeLink(`/book-discuss ${s.title}${by} — load my notes and past discussions, then ask me which chapter or topic.`))}" target="_blank" rel="noopener"${tip("discuss")}>Discuss</a>`,
			["own", "reading", "finished"].includes(st) && s.owned_format !== "kindle" ? `<a href="/book/${id}/give?back=${back}"${tip("give")}>Give away</a>` : "",
			st === "archived"
				? `<form method="post" action="/book/${id}/status"><input type="hidden" name="status" value="none"><button${tip("unarchive")}>Unarchive</button></form>`
				: main.includes("Archive") ? "" : `<a href="/book/${id}/archive?back=${back}"${tip("archive")}>Archive</a>`,
		].filter(Boolean);
		return `<section class="panel book-actions"><p><strong>${status}</strong><span class="muted">${bought}${owned}</span></p>${main ? `<div class="row-actions">${main}</div>` : ""}${more.length ? `<div class="more-actions">${more.join("")}</div>` : ""}</section>`;
	}

	function reviewPanel(s: SourceDetail) {
		const show = s.review || ["reading", "own", "finished"].includes(s.library_status);
		if (!show) return "";
		const editing = !s.review || c.req.query("edit_review") === "1";
		if (!editing)
			return `<section class="panel" id="review"><h2>My review <a href="/book/${id}?edit_review=1#review"${tip("editReview")}>Edit</a></h2>
<p><strong>${s.rating != null ? `${s.rating}/10` : "No rating"}</strong>${s.reread ? ` · Re-read: ${esc(s.reread)}` : ""}</p><div class="md">${renderMarkdown(s.review!.text)}</div></section>`;
		const f = reviewFromMarkdown(s.review?.text);
		const ratingOptions = Array.from({ length: 11 }, (_, n) => `<option value="${n}"${s.rating === n ? " selected" : ""}>${n}</option>`).join("");
		const field = (key: string, label: string, rows: number) =>
			`<label class="field">${esc(label)}${rows === 1 ? `<input name="r_${key}" value="${esc(f[key as keyof typeof f] ?? "")}">` : `<textarea name="r_${key}" rows="${rows}">${esc(f[key as keyof typeof f] ?? "")}</textarea>`}</label>`;
		return `<section class="panel" id="review"><h2>${s.review ? "Edit review" : "Review"}</h2>
<form method="post" action="/book/${id}/review" class="stack review-form">
  <div class="inline-fields">
    <label>Rating <select name="rating"><option value="">—</option>${ratingOptions}</select> / 10</label>
    <span>Re-read? ${["yes", "maybe", "no"].map((r) => `<label class="choice inline"><input type="radio" name="reread" value="${r}"${s.reread === r ? " checked" : ""}> ${r}</label>`).join(" ")}</span>
  </div>
  ${REVIEW_SECTIONS.map(([k, label]) => field(k, label, k === "verdict" ? 1 : 3)).join("\n  ")}
  <div class="inline-fields">
    ${s.library_status !== "finished" ? `<label class="choice"><input type="checkbox" name="finished" value="1" checked> I've finished it</label>` : ""}
    <label class="muted">Finished on <input type="date" name="finished_on" value="${esc(s.finished_on ?? "")}"></label>
    <button class="btn"${tip("saveReview")}>Save review</button>
  </div>
  <p class="muted">Fill in what you like — empty sections are left out. Rating mid-book? Untick “I've finished it”.</p>
</form></section>`;
	}
});

// ---- Status actions ----------------------------------------------------------

book.post("/book/:id/status", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	if (form.get("event") === "note_added") await applyStatusEvent(c.env.DB, id, "note_added");
	else {
		const status = toStatus(form.get("status"));
		if (status) await setStatus(c.env.DB, id, status, { finished_on: date(form.get("finished_on")) });
	}
	return c.redirect(safeBack(form.get("back"), `/book/${id}`), 303);
});

book.post("/book/:id/buy", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	await applyStatusEvent(c.env.DB, id, "add_to_buy_list");
	return c.redirect(safeBack(form.get("back"), `/book/${id}`), 303);
});

book.post("/book/:id/move", async (c) => {
	const form = await c.req.formData();
	await moveOnBuyList(c.env.DB, Number(c.req.param("id")), form.get("dir") === "down" ? "down" : "up");
	return c.redirect(safeBack(form.get("back"), "/buy"), 303);
});

book.post("/book/:id/verdict", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	const verdict = String(form.get("verdict") ?? "");
	const how = String(form.get("how") ?? "");
	if ((VERDICTS as readonly string[]).includes(verdict)) {
		await setVerdict(c.env.DB, id, { verdict: verdict as Verdict, how: (VERDICT_HOWS as readonly string[]).includes(how) ? how : null, why: String(form.get("why") ?? "").trim() || null, by: "me" });
	}
	return c.redirect(`/book/${id}`, 303);
});

book.post("/book/:id/verdict/unlock", async (c) => {
	const id = Number(c.req.param("id"));
	await unlockVerdict(c.env.DB, id);
	return c.redirect(`/book/${id}`, 303);
});

book.post("/book/:id/hide-featured", async (c) => {
	const form = await c.req.formData();
	await setHiddenFromFeatured(c.env.DB, Number(c.req.param("id")), form.get("show") !== "1");
	return c.redirect(safeBack(form.get("back")), 303);
});

/** Confirmation pages share one shape: a question, some fields, confirm/cancel. */
function confirmPage(c: HubContext, s: SourceDetail, title: string, action: string, intro: string, fields: string, button: string, danger = false) {
	const back = safeBack(c.req.query("back"), `/book/${s.id}`);
	return c.html(
		layout(c, "discover", title, `
<p>${intro}</p>
<form method="post" action="/book/${s.id}/${action}" class="stack">
  <input type="hidden" name="back" value="${esc(back)}">${fields}
  <div class="actions"><button class="btn${danger ? " danger-btn" : ""}">${button}</button><a class="btn secondary" href="${esc(back)}">Cancel</a></div>
</form>`),
	);
}

book.get("/book/:id/bought", async (c) => {
	const s = await getSource(c.env.DB, Number(c.req.param("id")));
	if (!s) return notFound(c, Number(c.req.param("id")));
	const symbol = CURRENCIES[await getCurrency(c.env.DB)].symbol.trim();
	return confirmPage(
		c, s, `Bought “${s.title}”`, "bought", "It moves to My shelf as not started.",
		`<fieldset class="inline-fields" style="border:0;padding:0">${BUY_FORMATS.map((f, i) => `<label class="choice"><input type="radio" name="format" value="${f}"${(s.buy_format ?? "first_hand") === f || (!s.buy_format && i === 0) ? " checked" : ""}> ${BUY_FORMAT_LABEL[f]}</label>`).join("")}</fieldset>
  <label>Price paid (${esc(symbol)}, optional) <input name="price" inputmode="decimal" style="width:8em"></label>`,
		"Save",
	);
});

book.post("/book/:id/bought", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	const format = BUY_FORMATS.find((f) => f === form.get("format"));
	await applyStatusEvent(c.env.DB, id, "bought", { bought_format: format, bought_price: num(form.get("price")) });
	return c.redirect(safeBack(form.get("back"), `/book/${id}`), 303);
});

book.get("/book/:id/archive", async (c) => {
	const s = await getSource(c.env.DB, Number(c.req.param("id")));
	if (!s) return notFound(c, Number(c.req.param("id")));
	return confirmPage(
		c, s, `Archive “${s.title}”?`, "archive",
		"Archived books are hidden from your lists and never recommended again. You can unarchive any time from the book page.",
		`<label class="choice"><input type="radio" name="reason" value="not_useful" checked> <span><strong>${ARCHIVE_LABEL.not_useful}</strong> — not for me, clutter, or a poor recommendation</span></label>
  <label class="choice"><input type="radio" name="reason" value="read_via_summary"> <span><strong>${ARCHIVE_LABEL.read_via_summary}</strong> — I got what I needed; shows in My shelf</span></label>`,
		"Yes, archive",
	);
});

book.post("/book/:id/archive", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	const reason = ARCHIVE_REASONS.find((r) => r === form.get("reason")) ?? "not_useful";
	await setStatus(c.env.DB, id, "archived", { archive_reason: reason });
	return c.redirect(safeBack(form.get("back"), "/discover"), 303);
});

book.get("/book/:id/give", async (c) => {
	const s = await getSource(c.env.DB, Number(c.req.param("id")));
	if (!s) return notFound(c, Number(c.req.param("id")));
	const symbol = CURRENCIES[await getCurrency(c.env.DB)].symbol.trim();
	if (s.owned_format === "kindle") return c.html(layout(c, "shelf", "Give away", `<p>“${esc(s.title)}” is a Kindle book, so it can't be given away. <a href="/book/${s.id}">Back</a></p>`));
	return confirmPage(c, s, `Give away “${s.title}”?`, "give", "It moves to My shelf → Given away. Your notes and review stay.", `<label>Price (${esc(symbol)}, optional) <input name="price" inputmode="decimal" style="width:8em"></label>`, "Yes, given away");
});

book.post("/book/:id/give", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	await applyStatusEvent(c.env.DB, id, "given_away", { given_price: num(form.get("price")) });
	return c.redirect(safeBack(form.get("back"), `/book/${id}`), 303);
});

// ---- Notes, review, tags -----------------------------------------------------

book.post("/book/:id/notes", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	const text = String(form.get("text") ?? "").trim();
	if (text && (await getSource(c.env.DB, id))) await addNote(c.env.DB, id, text.slice(0, 20000), String(form.get("locator") ?? "").slice(0, 100));
	return c.redirect(`/book/${id}#notes`, 303);
});

book.post("/book/:id/notes/:noteId/delete", async (c) => {
	await deleteNote(c.env.DB, Number(c.req.param("noteId")));
	return c.redirect(`/book/${c.req.param("id")}#notes`, 303);
});

book.post("/book/:id/review", async (c) => {
	const id = Number(c.req.param("id"));
	const form = await c.req.formData();
	const fromFields = reviewToMarkdown(Object.fromEntries(REVIEW_SECTIONS.map(([k]) => [k, String(form.get(`r_${k}`) ?? "").replace(/\r\n/g, "\n")])));
	const body = (fromFields || String(form.get("body") ?? "")).replace(/\r\n/g, "\n").trim();
	if (!body) return c.redirect(`/book/${id}#review`, 303);
	const s = await getSource(c.env.DB, id);
	if (!s) return notFound(c, id);
	const reread = (["yes", "maybe", "no"] as const).find((r) => r === form.get("reread"));
	const ratingRaw = String(form.get("rating") ?? "");
	await saveReview(c.env.DB, id, {
		body: body.slice(0, 50000),
		rating: ratingRaw === "" ? undefined : Number(ratingRaw),
		reread,
		finished: s.library_status === "finished" || form.get("finished") === "1",
		finished_on: date(form.get("finished_on")),
	});
	return c.redirect(`/book/${id}#review`, 303);
});

book.post("/book/:id/tags", async (c) => {
	const id = Number(c.req.param("id"));
	const tag = String((await c.req.formData()).get("tag") ?? "");
	if (tag.trim()) await saveTags(c.env.DB, id, [tag]);
	return c.redirect(`/book/${id}`, 303);
});

book.post("/book/:id/tags/remove", async (c) => {
	const id = Number(c.req.param("id"));
	await removeTag(c.env.DB, id, String((await c.req.formData()).get("tag") ?? ""));
	return c.redirect(`/book/${id}`, 303);
});

// ---- Merge and delete --------------------------------------------------------

book.get("/book/:id/delete", async (c) => {
	const s = await getSource(c.env.DB, Number(c.req.param("id")));
	if (!s) return c.redirect("/discover", 303);
	return confirmPage(
		c, s, `Delete “${s.title}” permanently?`, "delete",
		`This removes the book and everything attached: ${s.notes.length} notes, ${s.review ? "its review, " : ""}${s.editions.length} editions, ${s.appearance_count} appearances, ${s.discussion_count} discussions, ${s.summary_count} summaries. It can't be undone. <strong>Archive</strong> hides it instead and keeps the history.`,
		`<input type="hidden" name="confirm" value="yes">`,
		"Yes, delete",
		true,
	);
});

book.post("/book/:id/delete", async (c) => {
	if ((await c.req.formData()).get("confirm") === "yes") await deleteSource(c.env.DB, Number(c.req.param("id")));
	return c.redirect("/discover", 303);
});

book.get("/book/:id/merge", async (c) => {
	const id = Number(c.req.param("id"));
	const intoId = Number(c.req.query("into"));
	const [from, into] = await Promise.all([getSource(c.env.DB, id), getSource(c.env.DB, intoId)]);
	if (!from) return c.redirect("/discover", 303);
	if (!into || intoId === id) return c.html(layout(c, "discover", "Merge", `<p>Book #${intoId || "?"} doesn't exist (or is the same book). <a href="/book/${id}">Back</a></p>`), 404);
	return confirmPage(
		c, from, "Merge duplicates?", "merge",
		`“<strong>${esc(from.title)}</strong>” (#${id}) will be merged into “<strong>${esc(into.title)}</strong>” (#${intoId}). Notes, reviews, editions, tags, history, discussions and summaries move across; then #${id} is removed. Can't be undone.`,
		`<input type="hidden" name="into" value="${intoId}"><input type="hidden" name="confirm" value="yes">`,
		"Yes, merge",
	);
});

book.post("/book/:id/merge", async (c) => {
	const form = await c.req.formData();
	const intoId = Number(form.get("into"));
	if (form.get("confirm") === "yes" && (await mergeSources(c.env.DB, Number(c.req.param("id")), intoId))) return c.redirect(`/book/${intoId}`, 303);
	return c.redirect(`/book/${c.req.param("id")}`, 303);
});

// ---- Add a book (no Claude needed) -------------------------------------------

const ADD_AS: [string, string][] = [["want_to_buy", "Buy list"], ["own", "On shelf"], ["reading", "Reading"], ["finished", "Finished"]];

book.get("/add", async (c) => {
	const title = c.req.query("title")?.trim() ?? "";
	const author = c.req.query("author")?.trim() ?? "";
	const results = title ? await lookupBook(title, author || undefined) : [];
	const addForm = (fields: Record<string, string | number | null | undefined>, label: string) =>
		`<form method="post" action="/add" class="inline-fields">${Object.entries(fields)
			.filter(([, v]) => v != null && v !== "")
			.map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(String(v))}">`)
			.join("")}<select name="status" aria-label="Add as">${ADD_AS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select><button class="btn small">${label}</button></form>`;
	return c.html(
		layout(c, "shelf", "Add a book", `
<p class="muted">For books you already have or want — no Claude needed. Details come from Open Library; Claude can fill in the rest later with “Full details”.</p>
<form method="get" class="filters"><input name="title" value="${esc(title)}" placeholder="Title" required><input name="author" value="${esc(author)}" placeholder="Author (helps)"><button class="btn">Find</button></form>
${title
			? `${results.length ? `<ul class="plain">${results
					.map((r) => `<li><strong>${esc(r.title)}</strong> <span class="muted">${esc(r.authors.slice(0, 2).join(", "))}${r.first_publish_year ? ` · ${r.first_publish_year}` : ""}${r.pages_median ? ` · ${r.pages_median} pp` : ""}</span>
${addForm({ title: r.title, author: r.authors[0], year: r.first_publish_year, pages: r.pages_median, ol_work: r.ol_work, cover_url: r.cover_url, isbn13: r.isbn13[0] }, "Add")}</li>`)
					.join("")}</ul>` : `<p class="empty">Open Library found nothing.</p>`}
<p class="muted">Not listed?</p>${addForm({ title, author }, `Add “${title}” as typed`)}`
			: ""}`),
	);
});

book.post("/add", async (c) => {
	const f = await c.req.formData();
	const get = (k: string) => String(f.get(k) ?? "").trim() || undefined;
	const title = get("title");
	if (!title) return c.redirect("/add", 303);
	const year = num(get("year"));
	const pages = num(get("pages"));
	const result = await saveSource(c.env.DB, {
		title,
		authors: get("author") ? [get("author")!] : [],
		year,
		year_source: year ? "openlibrary" : undefined,
		pages,
		pages_source: pages ? "openlibrary" : undefined,
		ol_work: get("ol_work"),
		cover_url: get("cover_url"),
		isbn13: get("isbn13") && /^\d{13}$/.test(get("isbn13")!) ? [get("isbn13")!] : undefined,
		library_status: toStatus(get("status")) ?? "own",
		confirm_new: f.get("confirm_new") === "1",
	});
	if (result.status === "possible_duplicates") {
		const keep = [...f.entries()].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`).join("");
		return c.html(
			layout(c, "shelf", "Already in Book Hub?", `
<p>These look similar to “${esc(title)}”:</p>
<ul class="plain">${result.candidates.map((x) => `<li><a href="/book/${x.id}">${esc(x.title)}</a> <span class="muted">${esc(x.authors.join(", "))}${x.year ? ` · ${x.year}` : ""}</span></li>`).join("")}</ul>
<form method="post" action="/add" class="actions">${keep}<input type="hidden" name="confirm_new" value="1"><button class="btn secondary">It's a different book — add it</button></form>`),
		);
	}
	return c.redirect(`/book/${result.source.id}`, 303);
});

/**
 * Cards saved as one line per field ("Fit: …" lines with single line breaks) render as one run-on paragraph.
 * Give every field its own paragraph with a bold label, so old and new cards read the same.
 */
export function cardMarkdown(md: string) {
	return md
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.replace(/^([A-Z][^:*|#\n]{1,40}):\s+/, "**$1:** "))
		.join("\n")
		.replace(/(?<!\n)\n(?=\S)(?!- |\* |\||\d+\. )/g, "\n\n");
}
