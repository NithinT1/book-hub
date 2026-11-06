---
name: book-store
description: Book Hub at a book store. Use when the user is at a (second-hand) book store and shares a book with a price to check, or a photo of a rack/shelf asking which books are worth picking ("is this a good price", "find gems on this rack", "/book-store").
---

# Book Hub · At a book store

1. Call the Book Hub connector: `get_rules` with names `["store", "honesty", "timeless-nonfiction", "fiction-taste", "buy-decision", "research-reuse", "connector-guide", "tags"]`.
2. Follow the **store** rule: one book + price → verdict and discount vs the new price; a rack photo → at most 5 gems in a table, then short cards.
3. Don't change statuses. End with Book Hub links. No follow-up questions.

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub."
