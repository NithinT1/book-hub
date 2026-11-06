// The seven book statuses and how actions move between them. Pure functions, no database.
//
// Automatic changes (from what the user does) only move forward and never undo a finished or given-away book.
// Setting a status by hand in the hub can go anywhere.

export const STATUSES = ["none", "want_to_buy", "own", "reading", "finished", "archived", "given_away"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
	none: "Not decided",
	want_to_buy: "Want to buy",
	own: "On shelf — not started",
	reading: "Reading",
	finished: "Finished",
	archived: "Archived",
	given_away: "Given away",
};

export const ARCHIVE_REASONS = ["not_useful", "read_via_summary"] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
export const ARCHIVE_LABEL: Record<ArchiveReason, string> = { not_useful: "Not useful", read_via_summary: "Read via summary" };

export const BUY_FORMATS = ["first_hand", "second_hand", "kindle"] as const;
export type BuyFormat = (typeof BUY_FORMATS)[number];
export const BUY_FORMAT_LABEL: Record<BuyFormat, string> = { first_hand: "First-hand", second_hand: "Second-hand", kindle: "Kindle" };

/** v1 names still accepted from old chats and cached tool lists. */
const LEGACY: Record<string, Status> = { on_shelf: "own", owned: "own", not_decided: "none", want: "want_to_buy" };

export function toStatus(value: unknown): Status | undefined {
	if (typeof value !== "string") return undefined;
	return (STATUSES as readonly string[]).includes(value) ? (value as Status) : LEGACY[value];
}

export const EVENTS = ["add_to_buy_list", "bought", "catalogued", "note_added", "discussed", "rated", "reviewed", "finished", "archived", "given_away"] as const;
export type StatusEvent = (typeof EVENTS)[number];

/**
 * The status an action leads to, or null if it shouldn't change anything.
 * Examples: a note on a book you haven't marked → Reading; a note on a finished book → no change.
 */
export function nextStatus(current: Status, event: StatusEvent): Status | null {
	const to = (target: Status, from: Status[]) => (from.includes(current) && current !== target ? target : null);
	switch (event) {
		case "add_to_buy_list":
			return to("want_to_buy", ["none", "archived"]);
		case "bought":
		case "catalogued":
			return to("own", ["none", "want_to_buy", "archived", "given_away"]);
		case "note_added":
		case "discussed":
		case "rated":
			return to("reading", ["none", "want_to_buy", "own", "archived"]);
		case "reviewed":
		case "finished":
			return to("finished", ["none", "want_to_buy", "own", "reading", "archived"]);
		case "archived":
			return to("archived", ["none", "want_to_buy", "own", "reading", "finished"]);
		case "given_away":
			return to("given_away", ["own", "reading", "finished"]);
	}
}

/** Statuses that mean "I have it / had it" — covers are shown and it belongs on My shelf. */
export const SHELF_STATUSES: Status[] = ["own", "reading", "finished", "given_away"];
