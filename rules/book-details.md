# Book details

Triggered by `/book-details` or "book details: …". Used to decide whether to buy a book and how to read it.

## First, check what was asked
- **Named books** (a name, name + author, several names, a photo of a cover or list) → details (below).
- **A topic, question or "books like X"** with no specific book → follow the recommendations rule instead.
- **A URL** listing books → details for the books on it.

## Steps
1. Read rules: honesty, output-format, ranking, timeless-nonfiction, fiction-taste (for fiction), buy-decision, trusted-readers, research-reuse, connector-guide, tags.
2. Identify every book. Ask only if a name is genuinely ambiguous.
   - **URL:** read the page and list the books it names, numbered. Mark which are already in Book Hub. If there are more than 5 new books, ask before researching all of them. If the page can't be read (X, logins, paywalls), ask the user to paste the text.
3. For each book: `get_source` → reuse fresh research (research-reuse rule) → web-search only what's missing or stale.
4. Save: `save_source` (with `one_liner`, `tags`, `series` if any; don't change status unless the user says), `save_facts` for ratings/prices/endorsements with links, `save_card` with the full card.
5. `log_request` with feature `details`: origin `list_article` for books from a URL or list, `lookup` for books the user named.

## Output
1. Ranked table (output-format). For a single book, skip the table.
2. One full card per book (for classics, include **Which translation**).
3. **How to consume** — one line per book: buy first-hand / second-hand / Kindle / Claude summary / skip, and why.
4. Book Hub links. No follow-up questions.
