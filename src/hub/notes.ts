// Notes tab: reviews, notes, discussions and summaries in one place.

import { Hono } from "hono";
import { getDiscussion, getSummary, listDiscussions, listSources, listSummaries } from "../db";
import { reviewFromMarkdown } from "../library";
import { renderMarkdown } from "../markdown";
import { askButton, cover, esc, layout, statusBadge, tip, type HubEnv } from "./ui";

export const notes = new Hono<HubEnv>();

const VIEWS = [["notes", "Notes"], ["reviews", "Reviews"], ["discussions", "Discussions"], ["summaries", "Summaries"]] as const;

notes.get("/notes", async (c) => {
	const db = c.env.DB;
	const view = VIEWS.find(([k]) => k === c.req.query("view"))?.[0] ?? "notes";
	const q = c.req.query("q")?.trim() || undefined;
	const like = `%${q ?? ""}%`;
	let body = "";
	if (view === "reviews" || view === "notes") {
		const { results } = await db
			.prepare(
				`SELECT n.id, n.source_id, n.text, n.locator, n.created_at, s.title, s.rating, s.reread FROM notes n JOIN sources s ON s.id = n.source_id
				 WHERE n.kind = ? AND (n.text LIKE ? OR s.title LIKE ?) ORDER BY n.created_at DESC LIMIT 200`,
			)
			.bind(view === "reviews" ? "review" : "note", like, like)
			.all<{ id: number; source_id: number; text: string; locator: string | null; created_at: string; title: string; rating: number | null; reread: string | null }>();
		body = results.length
			? `<ul class="plain">${results
					.map((n) => `<li><a href="/book/${n.source_id}#${view === "reviews" ? "review" : "notes"}"><strong>${esc(n.title)}</strong></a> <span class="muted">${view === "reviews" && n.rating != null ? `· ${n.rating}/10 ` : ""}${n.locator ? `· ${esc(n.locator)} ` : ""}· ${esc(n.created_at.slice(0, 10))}</span><div class="clamp pre">${esc(view === "reviews" ? (reviewFromMarkdown(n.text).verdict ?? n.text.replace(/^#+\s.*$/gm, "").trim()) : n.text)}</div></li>`)
					.join("")}</ul>`
			: `<p class="empty">${view === "reviews" ? "No reviews yet. Tap “Write a review” and pick a book." : "No notes yet. Tap “Add a note” and pick a book."}</p>`;
	} else if (view === "discussions") {
		const rows = await listDiscussions(db, { query: q, limit: 200 });
		body = rows.length
			? `<ul class="plain">${rows.map((d) => `<li><a href="/discussion/${d.id}">${esc(d.title)}</a><div class="muted">${esc(d.book)}${d.locator ? ` · ${esc(d.locator)}` : ""} · ${esc(d.updated_at.slice(0, 10))}</div></li>`).join("")}</ul>`
			: `<p class="empty">None yet. In Claude: /book-discuss …, then say “save”.</p>`;
	} else {
		const rows = await listSummaries(db, { query: q, limit: 200 });
		body = rows.length
			? `<ul class="plain">${rows.map((m) => `<li><a href="/summary/${m.id}">${esc(m.book)}</a><div class="muted">${esc(m.created_at.slice(0, 10))} · ${Math.round(m.body.split(/\s+/).length / 200)} min read</div></li>`).join("")}</ul>`
			: `<p class="empty">None yet. In Claude: /book-summary …</p>`;
	}
	return c.html(
		layout(c, "notes", "Notes & reviews", `
<nav class="segmented">${VIEWS.map(([k, label]) => `<a href="/notes?view=${k}"${k === view ? ` aria-current="page"` : ""}>${label}</a>`).join("")}</nav>
<form class="search" method="get"><input type="hidden" name="view" value="${view}"><input type="search" name="q" value="${esc(q ?? "")}" placeholder="Search ${view}" aria-label="Search"><button class="btn">Search</button></form>
${body}`, {
			actions:
				view === "notes" ? `<a class="btn" href="/notes/pick?for=note"${tip("addNoteFromNotes")}>Add a note</a>`
				: view === "reviews" ? `<a class="btn" href="/notes/pick?for=review"${tip("addReviewFromNotes")}>Write a review</a>`
				: "",
		}),
	);
});

// Pick a book from My shelf, then land on its note box or review form.
notes.get("/notes/pick", async (c) => {
	const forReview = c.req.query("for") === "review";
	const statuses = forReview ? ["reading", "finished"] : ["reading", "own", "finished"];
	const rows = await listSources(c.env.DB, { statuses: statuses as any, sort: "library", limit: 1000 });
	const target = (id: number, hasReview: boolean) => (forReview ? `/book/${id}${hasReview ? "?edit_review=1" : ""}#review` : `/book/${id}?focus=note#notes`);
	return c.html(
		layout(c, "notes", forReview ? "Write a review" : "Add a note", `
<p class="muted">${forReview ? "Pick a book you're reading or have finished." : "Pick a book from your shelf. The note box opens ready to type (the microphone key works)."}</p>
<form class="search" method="get" onsubmit="return false"><input id="pick-q" type="search" placeholder="Search your shelf: title or author" aria-label="Search your shelf"></form>
${rows.length ? `<ul class="cards" id="pick-list">${rows
			.map((s) => `<li class="book" data-q="${esc(`${s.title} ${s.authors.join(" ")}`.toLowerCase())}"><a class="row" href="${target(s.id, s.has_review)}">${cover(s, "thumb")}<span class="row-text"><strong>${esc(s.title)}</strong><span class="muted">${esc(s.authors.join(", ") || "Author unknown")}</span><span class="tags">${statusBadge(s)}${s.has_review ? `<span class="tag">Reviewed</span>` : ""}</span></span></a></li>`)
			.join("")}</ul><p class="empty" id="pick-none" hidden>No book on your shelf matches.</p>` : `<p class="empty">Your shelf is empty.</p>`}
<p class="muted">Not on your shelf? <a href="/add">Add a book</a> first.</p>
<script>
const q = document.getElementById("pick-q"), items = [...document.querySelectorAll("#pick-list li")], none = document.getElementById("pick-none");
q?.addEventListener("input", () => { const t = q.value.trim().toLowerCase(); let n = 0; items.forEach((li) => { const hit = !t || li.dataset.q.includes(t); li.hidden = !hit; n += hit; }); if (none) none.hidden = n > 0; });
</script>`),
	);
});

notes.get("/discussion/:id", async (c) => {
	const d = await getDiscussion(c.env.DB, Number(c.req.param("id")));
	if (!d) return c.html(layout(c, "notes", "Not found", `<p>No such discussion. <a href="/notes?view=discussions">Back</a></p>`), 404);
	return c.html(
		layout(c, "notes", d.title, `
<p><a href="/book/${d.source_id}">← ${esc(d.book)}</a></p>
<p class="muted">${d.locator ? `${esc(d.locator)} · ` : ""}saved ${esc(d.created_at.slice(0, 10))}${d.updated_at !== d.created_at ? ` · updated ${esc(d.updated_at.slice(0, 10))}` : ""}</p>
<div class="actions">${askButton("Continue in Claude", `/book-discuss Continue my discussion "${d.title}" on ${d.book} (discussion #${d.id}).`, "btn secondary", "continueDiscussion")}</div>
<article class="md">${renderMarkdown(d.body)}</article>`),
	);
});

notes.get("/summary/:id", async (c) => {
	const m = await getSummary(c.env.DB, Number(c.req.param("id")));
	if (!m) return c.html(layout(c, "notes", "Not found", `<p>No such summary. <a href="/notes?view=summaries">Back</a></p>`), 404);
	return c.html(
		layout(c, "notes", m.book, `
<p><a href="/book/${m.source_id}">← Book page</a></p>
<p class="muted">Summary saved ${esc(m.created_at.slice(0, 10))} · about ${Math.round(m.body.split(/\s+/).length / 200)} min read</p>
<article class="md">${renderMarkdown(m.body)}</article>`),
	);
});
