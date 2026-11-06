// Markdown export of everything in Book Hub — a readable backup that also works as a note in Obsidian or similar.

import { getResearch, listDiscussions, listSources, listSummaries } from "./db";
import { ARCHIVE_LABEL, STATUS_LABEL, type ArchiveReason, type Status } from "./status";

/** Export order: what matters most first. "Not decided" recommendations are listed briefly at the end. */
const ORDER: Status[] = ["reading", "finished", "own", "want_to_buy", "given_away", "archived", "none"];

export async function buildMarkdownExport(db: D1Database): Promise<string> {
	const [sources, discussions, summaries, notes, editions] = await Promise.all([
		listSources(db, { sort: "library", limit: 5000, includeArchived: true }),
		listDiscussions(db, { limit: 5000 }),
		listSummaries(db, { limit: 5000 }),
		db.prepare("SELECT source_id, text, kind, locator, created_at FROM notes ORDER BY id").all<{ source_id: number; text: string; kind: string; locator: string | null; created_at: string }>(),
		db.prepare("SELECT source_id, label, translator, owned, notes FROM editions ORDER BY id").all<{ source_id: number; label: string; translator: string | null; owned: number; notes: string | null }>(),
	]);
	const by = <T extends { source_id: number }>(rows: T[]) => rows.reduce((m, r) => m.set(r.source_id, [...(m.get(r.source_id) ?? []), r]), new Map<number, T[]>());
	const notesBy = by(notes.results);
	const editionsBy = by(editions.results);
	const now = new Date().toISOString().slice(0, 16).replace("T", " ");

	const out: string[] = [
		"# Book Hub Library Export",
		"",
		`Exported from Book Hub on ${now} UTC. Part of [[Book Hub]]. Generated — edits here are overwritten; edit in the hub instead.`,
		"",
		`${sources.length} sources · ${sources.filter((s) => s.library_status === "finished").length} finished · ${sources.filter((s) => s.library_status === "reading").length} reading · ${sources.filter((s) => s.library_status === "want_to_buy").length} on the Buy list · ${discussions.length} discussions · ${summaries.length} summaries`,
		"",
	];

	for (const status of ORDER) {
		const group = sources.filter((s) => s.library_status === status);
		if (!group.length) continue;
		if (status === "want_to_buy") group.sort((x, y) => (x.buy_rank ?? 999) - (y.buy_rank ?? 999));
		out.push(`## ${STATUS_LABEL[status]} (${group.length})`, "");
		if (status === "none") {
			for (const s of group) out.push(`- ${s.title} — ${s.authors.join(", ")}${s.one_liner ? `: ${s.one_liner}` : ""}`);
			out.push("");
			continue;
		}
		for (const s of group) {
			const research = await getResearch(db, s.id);
			const bits = [
				s.authors.join(", "),
				s.type,
				s.year,
				s.rating != null ? `rated ${s.rating}/10` : null,
				s.reread ? `re-read: ${s.reread}` : null,
				s.most_featured ? "★ Most featured" : null,
				s.finished_on ? `finished ${s.finished_on}` : null,
				s.archive_reason ? ARCHIVE_LABEL[s.archive_reason as ArchiveReason] : null,
				s.tags.length ? s.tags.join(", ") : null,
			].filter(Boolean);
			out.push(`### ${s.title}`, bits.join(" · "));
			if (s.one_liner) out.push(`- **What it is:** ${s.one_liner}`);
			if (research.card?.timeless) out.push(`- **Timeless:** ${research.card.timeless.replace(/_/g, " ")}`);
			if (research.card?.buy) out.push(`- **Buy:** ${research.card.buy.replace(/_/g, " ")}`);
			for (const e of editionsBy.get(s.id) ?? []) out.push(`- **Edition:** ${e.label}${e.translator ? ` (tr. ${e.translator})` : ""}${e.owned ? " — I own this" : ""}${e.notes ? ` — ${e.notes}` : ""}`);
			for (const n of (notesBy.get(s.id) ?? []).filter((n) => n.kind === "note")) out.push(`- **Note (${n.created_at.slice(0, 10)}${n.locator ? `, ${n.locator}` : ""}):** ${n.text.replace(/\n+/g, " ")}`);
			const review = (notesBy.get(s.id) ?? []).find((n) => n.kind === "review");
			if (review) out.push("", "**My review**", "", review.text.trim().replace(/^#{1,3} /gm, "#### "));
			out.push("");
		}
	}

	if (discussions.length) {
		out.push("## Discussions", "");
		for (const d of discussions) out.push(`### ${d.book} — ${d.title}`, `${d.locator ? `${d.locator} · ` : ""}updated ${d.updated_at.slice(0, 10)}`, "", d.body.trim(), "");
	}
	if (summaries.length) {
		out.push("## Summaries", "");
		for (const m of summaries) out.push(`### ${m.book} — summary of ${m.created_at.slice(0, 10)}`, "", m.body.trim(), "");
	}
	return out.join("\n");
}

export async function buildJsonExport(db: D1Database) {
	const tables = ["sources", "series", "source_tags", "source_aliases", "source_ids", "editions", "facts", "cards", "requests", "appearances", "notes", "discussions", "summaries", "rules", "rules_history", "feedback", "test_runs"];
	const results = await db.batch(tables.map((t) => db.prepare(`SELECT * FROM ${t}`)));
	return Object.fromEntries(tables.map((t, i) => [t, results[i].results]));
}
