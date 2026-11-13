// The notifications page (phone) and panel (laptop, under the bell). Each notification has its own action and a ✕.

import { Hono } from "hono";
import { dismissNotice, listNotices, markNoticesSeen, type Notice } from "../notices";
import { claudeLink, esc, layout, tip, VERDICT_LABEL, type HubEnv } from "./ui";

export const notices = new Hono<HubEnv>();

const KIND: Record<Notice["kind"], string> = { verdict: "Verdict changed", stopped: "Stopped book", quiz: "Unfinished quiz", feedback: "Feedback" };

/** Only same-site paths are allowed back. */
const safeBack = (v: unknown) => (typeof v === "string" && /^\/(?!\/)/.test(v) ? v : "/notifications");

function item(n: Notice, isNew: boolean, back: string) {
	const backField = `<input type="hidden" name="back" value="${esc(back)}">`;
	let text = "";
	let acts = "";
	if (n.kind === "verdict") {
		const [change, why] = (n.detail ?? "").split("|");
		const [from, to] = change.split("→");
		text = `<a href="/book/${n.sourceId}">${esc(n.title)}</a>: ${esc(VERDICT_LABEL[from] ?? from)} → <strong>${esc(VERDICT_LABEL[to] ?? to)}</strong>${why ? `<div class="muted">${esc(why)}</div>` : ""}`;
		acts = `<a class="act" href="/book/${n.sourceId}">See why</a>`;
	} else if (n.kind === "stopped") {
		text = `<a href="/book/${n.sourceId}">${esc(n.title)}</a> has been stopped for a while. Pick it up again, or close it?`;
		acts = `<form method="post" action="/book/${n.sourceId}/status"><input type="hidden" name="event" value="note_added"><button class="act primary"${tip("resume")}>Resume</button></form>
<a class="act" href="/book/${n.sourceId}#review"${tip("finish")}>Finish &amp; review</a><a class="act" href="/book/${n.sourceId}/archive"${tip("archive")}>Archive</a>`;
	} else if (n.kind === "quiz") {
		const [answered, score] = (n.detail ?? "").split("|");
		text = `<a href="/book/${n.sourceId}">${esc(n.title)}</a> <span class="muted">· ${esc(answered)} answered · so far you know ${esc(score)}/10</span>`;
		acts = `<a class="act primary" href="${esc(claudeLink(`/book-quiz Continue my quiz on ${n.quizTitle}${n.quizAuthor ? ` by ${n.quizAuthor}` : ""}`))}" target="_blank" rel="noopener">Continue</a>`;
	} else {
		text = esc(n.title);
		acts = `<a class="act" href="/feedback">Open feedback</a>`;
	}
	return `<li class="nt-item${isNew ? " new" : ""}"><span class="n-kind">${KIND[n.kind]}</span>
<form class="n-x" method="post" action="/notifications/dismiss"><input type="hidden" name="key" value="${esc(n.key)}">${backField}<button aria-label="Delete this notification" title="${n.kind === "stopped" ? "Delete (it reminds you again in 30 days)" : "Delete"}">✕</button></form>
<div class="n-text">${text}</div><div class="n-acts">${acts}</div></li>`;
}

async function body(c: { env: HubEnv["Bindings"] }, back: string) {
	const db = c.env.DB;
	const [list, seen] = await Promise.all([listNotices(db), db.prepare("SELECT value FROM settings WHERE key = 'notices_seen_at'").first<{ value: string }>()]);
	await markNoticesSeen(db);
	const head = `<div class="notices-head"><h2>Notifications</h2>${list.length ? `<form method="post" action="/notifications/clear"><input type="hidden" name="back" value="${esc(back)}"><button class="btn secondary small">Delete all</button></form>` : ""}</div>`;
	if (!list.length) return `${head}<p class="muted">Nothing needs you right now.</p>`;
	return `${head}<ul class="nt-list">${list.map((n) => item(n, !seen?.value || n.at > seen.value, back)).join("")}</ul>`;
}

notices.get("/notifications", async (c) => {
	const back = safeBack(c.req.query("back"));
	if (c.req.query("part") === "1") return c.html(await body(c, back));
	return c.html(layout(c, null, "Notifications", await body(c, "/notifications"), { h1: false, notices: true }));
});

notices.post("/notifications/dismiss", async (c) => {
	const form = await c.req.formData();
	await dismissNotice(c.env.DB, String(form.get("key") ?? ""));
	return c.redirect(safeBack(form.get("back")), 303);
});

notices.post("/notifications/clear", async (c) => {
	const form = await c.req.formData();
	for (const n of await listNotices(c.env.DB)) await dismissNotice(c.env.DB, n.key);
	return c.redirect(safeBack(form.get("back")), 303);
});
