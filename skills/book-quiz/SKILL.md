---
name: book-quiz
description: Book Hub book quiz. Use when the user asks to be quizzed on a book to decide whether it's still worth reading ("book quiz", "quiz me on…", "/book-quiz", "continue my quiz"). Only when they ask for a quiz; "should I read this?" alone is book details. Not for discussing a book they're reading (book discuss).
---

# Book Hub · Book quiz

1. Call the Book Hub connector: `get_rules` with flow `"quiz"` (it returns every rule this command needs).
2. Follow the **quiz** rule: check it fits, ask one question at a time, score "You already know", give the debrief.
3. Save with `save_quiz`. Don't change the status. End with the Book Hub link.

If Book Hub tools aren't available, say: "Book Hub isn't connected in this chat — tap + → Connectors → Book Hub." You can still run the quiz, but say it can't be saved.
