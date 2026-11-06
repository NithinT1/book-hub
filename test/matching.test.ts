import { describe, expect, it } from "vitest";
import { authorKey, bestMatch, normalize, requestFingerprint, similarity, titleKey } from "../src/matching";
import { dedupeEditions, rank } from "../src/openlibrary";

describe("normalising", () => {
	it("strips case, accents, punctuation and leading articles", () => {
		expect(titleKey("The Hobbit: Or There and Back Again")).toBe("hobbit");
		expect(titleKey("Charlotte’s Web")).toBe("charlottes web");
		expect(normalize("Antoine de Saint-Exupéry")).toBe("antoine de saint exupery");
		expect(titleKey("Pride and Prejudice")).toBe("pride and prejudice");
	});
	it("uses the surname as author key", () => {
		expect(authorKey("Antoine de Saint-Exupéry")).toBe("exupery");
		expect(authorKey("J. R. R. Tolkien")).toBe("tolkien");
		expect(authorKey(undefined)).toBe("");
	});
	it("scores near-identical titles high", () => {
		expect(similarity("outlier", "outliers")).toBeGreaterThan(0.85);
	});
});

describe("bestMatch", () => {
	const lib = [
		{ id: 1, title_key: "outliers", author_key: "gladwell" },
		{ id: 2, title_key: "intelligent investor", author_key: "graham" },
		{ id: 3, title_key: "body", author_key: "bryson" },
		{ id: 4, title_key: "lord of the rings", author_key: "tolkien" },
	];
	it("matches singular/plural by the same author", () => {
		expect(bestMatch("outlier", "gladwell", lib)).toMatchObject({ kind: "match", source: { id: 1 } });
	});
	it("does not match the same title by a different author", () => {
		expect(bestMatch("intelligent investor", "zweig", lib).kind).toBe("none");
	});
	it("does not confuse 'The Body' with 'The Body Keeps the Score'", () => {
		expect(bestMatch("body keeps the score", "van der kolk", lib).kind).toBe("none");
	});
	it("needs an alias for LOTR → The Lord of the Rings", () => {
		expect(bestMatch("lotr", "tolkien", lib).kind).toBe("none");
		expect(bestMatch("lotr", "tolkien", [...lib, { id: 4, title_key: "lotr", author_key: "tolkien" }])).toMatchObject({ kind: "match", source: { id: 4 } });
	});
	it("treats an exact title with no author as a match", () => {
		expect(bestMatch("intelligent investor", "", lib)).toMatchObject({ kind: "match", source: { id: 2 } });
	});
	it("asks when only somewhat similar", () => {
		expect(bestMatch("meditatons on first philosophy", "aurelius", lib).kind).not.toBe("match");
	});
});

describe("request fingerprint", () => {
	it("ignores case and punctuation, not wording", async () => {
		expect(await requestFingerprint("recs", "Stoicism, for founders!")).toBe(await requestFingerprint("recs", "stoicism for founders"));
		expect(await requestFingerprint("recs", "stoicism")).not.toBe(await requestFingerprint("details", "stoicism"));
	});
});

describe("Open Library ranking", () => {
	const docs = [
		{ key: "/works/A", title: "The Name of the Rose [adaptation]", edition_count: 4 },
		{ key: "/works/B", title: "The Name of the Rose", edition_count: 203, author_name: ["Umberto Eco"], first_publish_year: 1980, isbn: ["9780156001311", "0156001314"] },
		{ key: "/works/C", title: "The Little Prince. CD", edition_count: 1 },
		{ key: "/works/D", title: "Brave New World / Island", edition_count: 48 },
		{ key: "/works/E", title: "The Name of the Rose", edition_count: 2 },
	];
	it("drops adaptations, audio and combined volumes; prefers the most-published work", () => {
		const out = rank("The Name of the Rose", docs);
		expect(out.map((c) => c.ol_work)).toEqual(["B", "E"]);
		expect(out[0].isbn13).toEqual(["9780156001311"]);
	});
});

describe("Open Library editions", () => {
	it("shows one row per book, keeping the most-published record and pooling ISBNs", () => {
		const docs = [
			{ key: "/works/A", title: "War and Peace", author_name: ["Leo Tolstoy"], first_publish_year: 2007, number_of_pages_median: 893, edition_count: 40, isbn: ["9780060198817"] },
			{ key: "/works/B", title: "War and Peace", author_name: ["Leo Tolstoy"], first_publish_year: 2007, number_of_pages_median: 980, edition_count: 5, isbn: ["9780330396110"] },
			{ key: "/works/C", title: "War and Peace: The Maude Translation", author_name: ["Leo Tolstoy"], first_publish_year: 2017, edition_count: 3, isbn: ["9781447248460"] },
			{ key: "/works/D", title: "War and Peace", author_name: ["Someone Else"], edition_count: 1 },
		];
		const out = dedupeEditions(rank("War and Peace", docs));
		expect(out.map((c) => c.ol_work)).toEqual(["A", "D"]);
		expect(out[0]).toMatchObject({ pages_median: 893, first_publish_year: 2007 });
		expect(out[0].isbn13.sort()).toEqual(["9780060198817", "9780330396110", "9781447248460"].sort());
	});
});
