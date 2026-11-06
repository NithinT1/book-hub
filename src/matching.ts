// Pure functions that decide whether two titles/authors are the same work.
// Claude cleans up what the user typed (spelling, "author - title" order); this only has to be robust
// to small differences: case, accents, punctuation, leading "The", subtitles, singular/plural.

const LEADING_ARTICLES = /^(the|a|an)\s+/;

export function normalize(s: string): string {
	return s
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // accents: Śmierć → Smierc
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/['’`]/g, "") // man's → mans
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

/** Title key: main title only (no subtitle), no leading article. "The Hobbit: Or There and Back Again" → "hobbit". */
export function titleKey(title: string): string {
	const main = title.split(/[:(\[]| - | — /)[0];
	return normalize(main).replace(LEADING_ARTICLES, "");
}

/** Author key: surname of the author, ignoring initials. "A. C. Bhaktivedanta Swami Prabhupada" → "prabhupada". */
export function authorKey(author: string | undefined | null): string {
	if (!author) return "";
	const parts = normalize(author).split(" ").filter((p) => p.length > 1);
	return parts.at(-1) ?? "";
}

/** Similarity between 0 and 1 based on edit distance. */
export function similarity(a: string, b: string): number {
	if (a === b) return 1;
	if (!a || !b) return 0;
	return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[b.length];
}

/** At or above: treat as the same work automatically ("meditation" vs "meditations"). */
export const SAME_WORK = 0.85;
/** At or above (but below SAME_WORK): ask before deciding. */
export const POSSIBLE_MATCH = 0.6;

export type Candidate = { id: number; title_key: string; author_key: string };
export type MatchResult<T extends Candidate> =
	| { kind: "match"; source: T; score: number }
	| { kind: "possible"; candidates: { source: T; score: number }[] }
	| { kind: "none" };

/**
 * Compare a title/author against candidates (sources and their aliases, flattened).
 * Same author + very similar title = match. Missing author on either side = only an exact title counts.
 */
export function bestMatch<T extends Candidate>(tKey: string, aKey: string, candidates: T[]): MatchResult<T> {
	const scored = candidates
		.map((c) => {
			const authorsComparable = aKey && c.author_key;
			if (authorsComparable && similarity(aKey, c.author_key) < SAME_WORK) return { source: c, score: 0 };
			const titleScore = similarity(tKey, c.title_key);
			return { source: c, score: authorsComparable ? titleScore : titleScore === 1 ? 0.9 : titleScore * 0.7 };
		})
		.filter((s) => s.score >= POSSIBLE_MATCH)
		.sort((x, y) => y.score - x.score);

	// The same source can appear several times via aliases; keep its best score.
	const seen = new Set<number>();
	const unique = scored.filter((s) => (seen.has(s.source.id) ? false : (seen.add(s.source.id), true)));

	if (unique.length === 0) return { kind: "none" };
	if (unique[0].score >= SAME_WORK && (unique.length === 1 || unique[1].score < SAME_WORK)) {
		return { kind: "match", source: unique[0].source, score: unique[0].score };
	}
	return { kind: "possible", candidates: unique.slice(0, 5) };
}

/** Same feature + same wording (ignoring case/punctuation) = same request. */
export async function requestFingerprint(feature: string, input: string): Promise<string> {
	const data = new TextEncoder().encode(`${feature}|${normalize(input)}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
