---
name: book-shelf
description: Book Hub — my own shelf. Use when the user shares photos of their own bookshelf (or lists books they own) to add them to their library, or asks which of their books to give away ("book shelf", "add these from my shelf", "what can I give away").
---

# Book Hub · My shelf

1. Call the Book Hub connector: `get_rules` with flow `"shelf"` (it returns every rule this command needs).
2. Follow the **shelf** rule: **catalogue** (list spines, skip what's already there, save only after the user says "save") or **give away** (a table of only the books that can go, with reasons and a price range).

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub."
