---
name: book-checkin
description: Book Hub check-in, monthly or quarterly. Use when the user asks for a Book Hub check-in, "what should I read next" based on what they've read and rated, or what's pending in their Book Hub ("/book-checkin").
---

# Book Hub · Check-in

1. Call the Book Hub connector: `get_rules` with flow `"checkin"` (it returns every rule this command needs).
2. Follow the **checkin** rule: two picks each for "more like what you loved", "different / opposing" and "from your Buy list"; then the short list of pending actions.
3. Don't change anything yourself. End with Book Hub links.

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub."
