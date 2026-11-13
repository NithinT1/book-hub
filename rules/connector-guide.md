# How to use the Book Hub connector

Read this before saving anything.

## Identifying a book
1. Clean up what the user typed first: fix spelling ("Harry Poter" → Harry Potter, "Pride and Predjudice" → Pride and Prejudice), split "author - title", and expand short forms ("LOTR" → The Lord of the Rings by J.R.R. Tolkien).
2. If a title could be more than one book ("The Prince", "Rebecca"), ask which one before saving. Never guess silently.
3. Call `lookup_book` with the clean title and author. It returns Open Library candidates plus any existing Book Hub match. Open Library data has errors (wrong years, duplicates, foreign titles) — check year and pages; if they disagree, say so and prefer the better-sourced value.

## Saving a book
- `authors`: the original author first — never the translator (Homer, Leo Tolstoy, Haruki Murakami).
- **One row per work.** Revised, expanded, anniversary, abridged and other editions are the same book: never a separate row, and don't discuss edition differences unless asked.
- **Translations matter only for classics and translated works** (The Odyssey, Tao Te Ching, War and Peace, Dostoevsky…). Keep one row; put a specific translation in `edition` (label, translator). On cards and recommendations, name the **recommended translation for this user and why** (readability, faithfulness, commentary or not).
- **Every save includes** a spoiler-free `one_liner` (what it is and why it's interesting — no plot twists, no endings) and 2–4 `tags` from the tags rule.
- **Series:** each book is its own row. Pass `series` (name, position, and the other books as names). Never save the other books in the series as rows unless they were actually recommended for the request.
- **Not books:** films and TV adaptations of a book are never saved as separate rows — mention them in the card instead. Documentaries, talks, papers, articles and threads may be saved with the right `kind` when they're genuinely recommended.
- Add the user's wording and other common names as `aliases`.
- `year_source` / `pages_source`: "openlibrary", "claude-web", "claude-memory", or "user".
- If `save_source` returns `possible_duplicates`, show the candidates and ask: same book (`merge_into`) or different (`confirm_new: true`).

## Statuses
Eight statuses: not decided (`none`), `want_to_buy` (Buy list), `own` (on shelf, not started), `reading`, `stopped` (put down partway, still on the shelf), `finished`, `archived`, `given_away`.
- **Don't set or ask about status unless the user says something about it.** The hub moves statuses automatically from the user's actions: a note or discussion → reading (this also resumes a stopped book); a review → finished; "bought" → own. Only the user stops a book.
- When the user does say it ("add to my buy list", "I bought it second-hand for 250", "I gave it away", "archive it — the summary was enough"), call `set_library_status` with the details.
- Never ask follow-up questions like "did you buy it?" or "should I archive it?". The user updates the hub when they want to.

## Links
Results include `hub_url`. End every answer with links to the hub pages for the books involved (and the Buy list or My shelf when relevant), so the user can continue there.

## Feedback
When the user says "book hub feedback: …" (or reports a Book Hub problem), call `save_feedback` with their words and one line of context.

## Never
- Never invent a book, author, year, page count, rating, price, quote or endorsement. If you couldn't find it, say "couldn't fetch".
- Never recommend a book the user archived.
- The connector has no delete tool. Deleting and merging happen in the hub.
