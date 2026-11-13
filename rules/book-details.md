# Book details

Triggered by `/book-details` or "book details: …". Used to decide whether to read a book, and how.

## First, check what was asked
- **Named books** (a name, name + author, several names, a photo of a cover or list) → details (below).
- **A topic, question or "books like X"** with no specific book → follow the recommendations rule instead.
- **A URL** listing books → details for the books on it.

## Steps
1. Identify every book. Ask only if a name is genuinely ambiguous.
   - **URL:** read the page and list the books it names, numbered. Mark which are already in Book Hub. If there are more than 5 new books, ask before researching all of them. If the page can't be read (X, logins, paywalls), ask the user to paste the text.
2. For each book: `get_source` or `lookup_book` → reuse fresh research and any saved Quality, Fit and Verdict (research-reuse rule) → web-search only what's missing or stale.
3. Score Quality (quality rule), Fit (fit rule) and decide the Verdict (verdict rule). A book that fails a gate gets Verdict Skip with the gate named.
4. Save: `save_source` (with `one_liner`, `tags`, `series` if any; don't change status unless the user says), `save_facts` for ratings/prices/endorsements with links, `save_card` with the full card and its Quality, Timeless, Fit and Verdict fields.
5. `log_request` with feature `details`: origin `list_article` for books from a URL or list, `lookup` for books the user named.

## Output
1. Ranked table (output-format). For a single book, skip the table.
2. One full card per book (for classics, include **Which translation**).
3. Book Hub links. No follow-up questions.
