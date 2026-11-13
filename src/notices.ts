// Notifications: things that need the reader's attention, worked out fresh from the data on each look.
// Nothing is stored except what the reader has deleted (and until when) and when they last opened the bell.

import { getSetting, setSetting, unfinishedQuizzes } from "./db";

export type NoticeKind = "verdict" | "stopped" | "quiz" | "feedback";
export type Notice = {
	key: string;
	kind: NoticeKind;
	sourceId?: number;
	title: string;
	detail?: string;
	/** When it became something to look at; newer than the last look = counted on the bell. */
	at: string;
	quizTitle?: string;
	quizAuthor?: string;
};

const DAY = 86_400_000;
const STOP_NUDGE_DAYS = 30;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const DISMISSED = "notice_dismissed:";

async function dismissals(db: D1Database) {
	const { results } = await db.prepare("SELECT key, value FROM settings WHERE key LIKE ?").bind(`${DISMISSED}%`).all<{ key: string; value: string }>();
	return new Map(results.map((r) => [r.key.slice(DISMISSED.length), r.value]));
}

export async function listNotices(db: D1Database, now = Date.now()): Promise<Notice[]> {
	const [verdicts, stopped, quizzes, feedback, gone] = await Promise.all([
		db
			.prepare(
				`SELECT h.id, h.source_id, h.verdict, h.why, h.created_at, s.title,
				   (SELECT p.verdict FROM verdict_history p WHERE p.source_id = h.source_id AND p.id < h.id ORDER BY p.id DESC LIMIT 1) AS prev
				 FROM verdict_history h JOIN sources s ON s.id = h.source_id
				 WHERE h.set_by = 'ai' AND h.created_at >= ? ORDER BY h.id DESC`,
			)
			.bind(iso(now - 30 * DAY))
			.all<{ id: number; source_id: number; verdict: string; why: string | null; created_at: string; title: string; prev: string | null }>(),
		db
			.prepare("SELECT id, title, status_changed_at FROM sources WHERE library_status = 'stopped' AND status_changed_at <= ?")
			.bind(iso(now - STOP_NUDGE_DAYS * DAY))
			.all<{ id: number; title: string; status_changed_at: string }>(),
		unfinishedQuizzes(db),
		db.prepare("SELECT COUNT(*) AS n, MAX(id) AS last, MAX(created_at) AS at FROM feedback WHERE status = 'open'").first<{ n: number; last: number | null; at: string | null }>(),
		dismissals(db),
	]);
	const out: Notice[] = [];
	const seenBook = new Set<number>();
	for (const v of verdicts.results) {
		// Only real changes, and only the latest one per book.
		if (!v.prev || v.prev === v.verdict || seenBook.has(v.source_id)) continue;
		seenBook.add(v.source_id);
		out.push({ key: `verdict:${v.id}`, kind: "verdict", sourceId: v.source_id, title: v.title, detail: `${v.prev}→${v.verdict}${v.why ? `|${v.why}` : ""}`, at: v.created_at });
	}
	for (const s of stopped.results) {
		const due = iso(Date.parse(s.status_changed_at) + STOP_NUDGE_DAYS * DAY);
		out.push({ key: `stopped:${s.id}:${s.status_changed_at}`, kind: "stopped", sourceId: s.id, title: s.title, at: due });
	}
	for (const q of quizzes) out.push({ key: `quiz:${q.id}`, kind: "quiz", sourceId: q.source_id, title: q.title, detail: `${q.ideas.length}|${q.score}`, at: q.created_at, quizTitle: q.title, quizAuthor: q.authors[0] });
	if (feedback?.n) out.push({ key: `feedback:${feedback.last}`, kind: "feedback", title: `${feedback.n} open feedback ${feedback.n === 1 ? "item" : "items"}`, at: feedback.at! });
	// Deleted ones stay hidden; a snoozed one (stopped books) comes back when its time is up, as new.
	return out
		.flatMap((n) => {
			const until = gone.get(n.key);
			if (until === undefined) return [n];
			if (until === "forever" || Date.parse(until) > now) return [];
			return [{ ...n, at: until }];
		})
		.sort((a, b) => b.at.localeCompare(a.at));
}

/** How many notifications arrived since the bell was last opened. */
export async function newNoticeCount(db: D1Database, now = Date.now()) {
	const [all, seen] = await Promise.all([listNotices(db, now), getSetting(db, "notices_seen_at")]);
	return all.filter((n) => !seen || n.at > seen).length;
}

export async function markNoticesSeen(db: D1Database, now = Date.now()) {
	await setSetting(db, "notices_seen_at", iso(now));
}

/** Delete a notification. A stopped-book reminder is snoozed instead, so it nudges again in 30 days. */
export async function dismissNotice(db: D1Database, key: string, now = Date.now()) {
	if (!/^(verdict|stopped|quiz|feedback):[\w:.-]+$/.test(key)) return false;
	await setSetting(db, `${DISMISSED}${key}`, key.startsWith("stopped:") ? iso(now + STOP_NUDGE_DAYS * DAY) : "forever");
	return true;
}
