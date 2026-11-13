---
name: book-details
description: Book Hub book details. Use when the user names one or more specific books, shares a URL listing books, or a photo of a book list/cover, and wants full details, a ranking, which translation to pick, or a buy / how-to-read decision ("book details", "should I buy", "is this worth reading").
---

# Book Hub · Book details

1. Call the Book Hub connector: `get_rules` with flow `"details"` (it returns every rule this command needs).
2. Follow the **book-details** rule exactly. If the request is really a topic or "books like X", follow the **recommendations** rule instead.
3. End with the Book Hub links. No follow-up questions.

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub."
