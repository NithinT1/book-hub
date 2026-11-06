// Free book facts from Open Library (no key needed). Its data has known errors (wrong years, duplicate
// works, foreign-language titles), so results are a starting point: every value is labelled with its source
// and Claude is told to verify before relying on it.

import { authorKey, normalize, similarity, titleKey } from "./matching";

export type BookCandidate = {
	title: string;
	authors: string[];
	first_publish_year: number | null;
	pages_median: number | null;
	edition_count: number;
	isbn13: string[];
	ol_work: string;
	cover_url: string | null;
	link: string;
};

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const FIELDS = "key,title,author_name,first_publish_year,number_of_pages_median,edition_count,isbn,cover_i";
// Titles that are about the book rather than the book itself.
const NOT_THE_BOOK = /\[adaptation\]|\b(cd|audio ?book|study guide|summary of|travel journal|workbook|sparknotes|cliffs ?notes)\b/i;

export async function lookupBook(title: string, author: string | undefined, fetcher: Fetcher = fetch): Promise<BookCandidate[]> {
	const params = new URLSearchParams({ title, fields: FIELDS, limit: "15" });
	if (author) params.set("author", author);
	let docs = await search(params, fetcher);
	if (docs.length === 0) {
		// Structured search found nothing: fall back to a general query.
		docs = await search(new URLSearchParams({ q: [title, author].filter(Boolean).join(" "), fields: FIELDS, limit: "15" }), fetcher);
	}
	return dedupeEditions(rank(title, docs)).slice(0, 3);
}

/**
 * Open Library often lists one book several times (different editions or duplicate records). Keep one row per
 * title + author — the best-ranked one — and pool the ISBNs so matching still recognises every edition.
 */
export function dedupeEditions(candidates: BookCandidate[]): BookCandidate[] {
	const kept = new Map<string, BookCandidate>();
	for (const c of candidates) {
		const key = `${titleKey(c.title)}|${authorKey(c.authors[0])}`;
		const first = kept.get(key);
		if (!first) kept.set(key, { ...c, isbn13: [...c.isbn13] });
		else first.isbn13 = [...new Set([...first.isbn13, ...c.isbn13])].slice(0, 10);
	}
	return [...kept.values()];
}

async function search(params: URLSearchParams, fetcher: Fetcher): Promise<any[]> {
	try {
		const resp = await fetcher(`https://openlibrary.org/search.json?${params}`, {
			headers: { "User-Agent": "book-hub (personal reading hub)" },
		});
		if (!resp.ok) return [];
		const body = (await resp.json()) as { docs?: any[] };
		return body.docs ?? [];
	} catch {
		return [];
	}
}

/** Prefer the closest title, then the most-published work; drop adaptations, combined volumes, audio etc. */
export function rank(queryTitle: string, docs: any[]): BookCandidate[] {
	const q = titleKey(queryTitle);
	return docs
		.filter((d) => d.title && !NOT_THE_BOOK.test(d.title) && !/ \/ |;/.test(d.title))
		.map((d) => {
			const titleScore = Math.max(similarity(q, titleKey(d.title)), similarity(normalize(queryTitle), normalize(d.title)));
			const popularity = Math.log10((d.edition_count ?? 1) + 1) / 3; // 0..~1
			return { d, score: titleScore * 2 + popularity, titleScore };
		})
		.filter((x) => x.titleScore >= 0.5)
		.sort((a, b) => b.score - a.score)
		.map(({ d }) => ({
			title: d.title,
			authors: d.author_name ?? [],
			first_publish_year: d.first_publish_year ?? null,
			pages_median: d.number_of_pages_median ?? null,
			edition_count: d.edition_count ?? 0,
			isbn13: (d.isbn ?? []).filter((i: string) => i.length === 13).slice(0, 5),
			ol_work: String(d.key).replace("/works/", ""),
			cover_url: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
			link: `https://openlibrary.org${d.key}`,
		}));
}
