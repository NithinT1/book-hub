// Assertions for promptfoo. Each gets (output, context) and returns { pass, score, reason }.
const parse = (output) => JSON.parse(output);
const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason });

export function honesty(output) {
	const { text } = parse(output);
	const bad = text
		.split("\n")
		.filter((l) => /(goodreads|amazon)/i.test(l) && /\d\.\d/.test(l))
		.filter((l) => !/(https?:\/\/|\]\(|couldn.t fetch|claude.s rating)/i.test(l));
	return result(bad.length === 0, bad.length ? `Rating without link: ${bad[0].slice(0, 200)}` : "Ratings are linked or marked couldn't fetch");
}

export function timeless(output, { vars }) {
	const { cards } = parse(output);
	const card = cards.find((c) => c.title.toLowerCase().includes(vars.title.toLowerCase()));
	if (!card) return result(false, `No saved card for "${vars.title}"`);
	const accepted = String(vars.timeless).split("|");
	return result(accepted.includes(card.timeless), `timeless = ${card.timeless}, expected ${vars.timeless}`);
}

export function fewOrNone(output) {
	const { text, requests, appearances } = parse(output);
	const recs = appearances.filter((a) => a.origin === "recommended");
	const explained = /(no (good |real )?books?|none|couldn.t find|don.t know of|only (one|two|1|2))/i.test(text);
	return result(recs.length <= 2 && explained, `${recs.length} recommended, explained=${explained}, requests logged=${requests.length}`);
}

export function rankedRecs(output) {
	const { text, requests, appearances } = parse(output);
	// Main picks are ranks 1–5 (a "6th" is rank 6); "better than a book" sources carry no rank.
	const recs = appearances.filter((a) => a.origin === "recommended" && a.rank >= 1);
	const ranked = recs.every((a, i) => a.rank === i + 1);
	const table = /\|\s*(rank|#)\s*\|/i.test(text);
	const finishedMarked = !/art of war/i.test(text) || /art of war[^\n]*(✓|finished)/i.test(text) || /(✓|finished)[^\n]*art of war/i.test(text);
	const ok = requests.some((r) => r.feature === "recs") && recs.length >= 2 && recs.length <= 6 && ranked && table && finishedMarked;
	return result(ok, `logged=${requests.length}, picks=${recs.length}, ranked=${ranked}, table=${table}, finished marked=${finishedMarked}`);
}

export function singleBookDetails(output) {
	const { requests, appearances } = parse(output);
	const recommended = appearances.filter((a) => a.origin === "recommended");
	const details = requests.some((r) => r.feature === "details");
	return result(details && recommended.length === 0, `details logged=${details}, recommended picks=${recommended.length}`);
}

export function storePrice(output) {
	const { text, requests } = parse(output);
	const discount = /\d+\s*%/.test(text) || /couldn.t fetch/i.test(text);
	const verdict = /\b(buy|skip)\b/i.test(text);
	return result(discount && verdict && requests.some((r) => r.feature === "store"), `discount/price=${discount}, verdict=${verdict}, logged=${requests.map((r) => r.feature)}`);
}

export function giveaway(output) {
	const { text } = parse(output);
	const tableRows = text.split("\n").filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l)).slice(1);
	const timelessListed = tableRows.some((l) => /art of war/i.test(l));
	return result(tableRows.length > 0 && !timelessListed, `table rows=${tableRows.length}, The Art of War in table=${timelessListed}`);
}

export function noteMeansReading(output) {
	const { books } = parse(output);
	const book = books.find((b) => /outliers/i.test(b.title));
	return result(book?.status === "reading", `Outliers status = ${book?.status}`);
}
