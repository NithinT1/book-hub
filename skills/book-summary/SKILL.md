---
name: book-summary
description: Book Hub long summary. Use when the user asks for a detailed book summary they can read in 30–60 minutes instead of the book ("book summary", "summarise this book in depth"), including an originality check and critique.
---

# Book Hub · Long summary

1. Call the Book Hub connector: `get_rules` with names `["summary", "honesty"]`.
2. Find or save the book (`lookup_book` / `save_source`), then `get_summary` — if one exists, ask whether to open it or write a fresh one.
3. Follow the **summary** rule, then save with `save_summary`. Don't ask whether to archive the book. End with the Book Hub link.

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub."
