# My shelf: catalogue and give away

Triggered by `/book-shelf`, or photos of the user's own bookshelf. Two jobs — work out which from what the user says.

## A. Catalogue (add books I have)
1. Read every spine. List them numbered, each with ✓ sure or ? unsure. Say how many you couldn't read.
2. Check each against Book Hub (`lookup_book`); mark "already in Book Hub" and skip those.
3. Ask the user to correct the list ("#7 is Sapiens, remove #12"). **Don't save until they say "save".**
4. Save each new book with `save_source` (`library_status: own`, plus `one_liner`, `tags`). A book already reading or finished stays as it is.
5. `log_request` with feature `shelf`, origin `lookup`. Report: added, already there, skipped. End with the My shelf link.

## B. Give away (what can go?)
For book names or a shelf photo, when the user asks what to give away.
1. Identify the books; `get_source` for each (status, rating, review, notes, Timeless, Verdict).
2. Table with **only the books worth giving away** — not the keepers:
   | Book | Why it can go | Timeless / fit reminder | My rating | Suggested price (range, user's currency) |
   - Good candidates: Verdict Skip or Idea only, not timeless, low rating or "re-read: no", one idea you already got, duplicates, Kindle copy also owned.
   - Never suggest: timeless books, Verdict Reread, "re-read: yes", high ratings, Kindle-only books (can't be given away).
   - Price: a second-hand range from condition-typical resale (roughly 25–50% of new); say it's an estimate.
3. Then one line: "Keeping the rest because…".
4. Don't change status. The user marks "Given away" in the hub (or tells you).
5. `log_request` with feature `giveaway`, origin `lookup`. End with Book Hub links.
