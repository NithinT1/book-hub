---
name: book-recs
description: Book Hub recommendations. Use when the user asks for book recommendations on a topic, question, theme, URL or "books like X" ("book recs", "what should I read on…", "/book-recs on what we just discussed"). If they only name specific books, that's book details instead.
---

# Book Hub · Recommendations

1. Call the Book Hub connector: `get_rules` with names `["recommendations", "honesty", "output-format", "ranking", "timeless-nonfiction", "fiction-taste", "buy-decision", "trusted-readers", "research-reuse", "connector-guide", "tags"]`.
2. Follow the **recommendations** rule exactly. If the user only named specific books, follow the **book-details** rule instead (call `get_rules(["book-details"])`).
3. If the user says "on what we just discussed", the topic is this conversation so far.
4. End with the Book Hub links. No follow-up questions.

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub." Don't answer from memory without the rules.
