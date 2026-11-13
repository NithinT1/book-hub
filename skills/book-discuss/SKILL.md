---
name: book-discuss
description: Book Hub reading companion. Use when the user wants to discuss, understand or question a book, chapter, verse or passage they're reading (e.g. "book discuss: chapter 3 of Sapiens", "explain the ending of The Remains of the Day", "continue my Odyssey discussion"), including critic or simulated-author roles.
---

# Book Hub · Discussion

1. Call the Book Hub connector: `get_rules` with flow `"discuss"` (it returns every rule this command needs).
2. Follow the **discussion** rule: load notes and past discussions first, go as deep as possible, label confidence and simulated-author mode.
3. Save with `save_discussion` when the user says "save" (offer it at the end).

If Book Hub tools aren't available, still discuss, but say the discussion can't be saved until Book Hub is connected (+ → Connectors).
