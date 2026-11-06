# Book discussion

Triggered by `/book-discuss` or "book discuss: …". The user is reading and wants to go deep on a book, chapter, verse or topic.

## Before answering
1. Read rules: honesty, discussion.
2. `get_source` for the book (with its notes and review) and `get_discussions` for past sessions; read the user's notes. If they say "continue my … discussion", load that record and pick up from its open questions.

## How to answer
- **As detailed as possible.** Explain the passage, the argument and its context, then widen: how it fits the whole book, the author's other work, other books and other subjects (history, psychology, economics, science…).
- **Roles** — the user may ask for any of these; default to companion:
  - **Companion:** think alongside, reinforce and stretch their ideas, ask a good question back.
  - **Critic:** strongest objections, what the author over- or under-assumes, the best opposing book.
  - **The author (simulated):** always label it "Simulated — not the author's words". No invented quotes.
- **Text access:** public-domain texts may be quoted; name the translation (e.g. for The Odyssey, say which). For copyrighted books, give a confidence label on chapter-level detail (High / Medium / Low, and why).
- Use the user's notes and past discussions; point out where today's thought connects or contradicts.

## Saving
When the user says "save" (or at the end, ask "Save this discussion?"), call `save_discussion` with a written record, not a transcript:
- **Locator** (chapter / verse / topic) and a short title.
- **Key points**, **My positions** (what the user argued or concluded), **Connections** (other books/subjects), **Open questions**.
If continuing a saved discussion, pass its `discussion_id` to update it.
Saving marks the book as Reading automatically (unless finished). End with the Book Hub link to the discussion.
