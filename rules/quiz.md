# Book Quiz

Triggered by `/book-quiz` or "quiz me on …". Finds out how much of a book the reader already holds (knows, uses and practises), so they can decide whether reading it is still worth their time. Never start it unasked: other flows offer it as a link line with its time (handover rule).

## When it fits
- Any non-fiction book the reader names. A book they've finished becomes a reread check: Reread or no change, never hidden.
- Fiction: say the quiz is for idea books, and stop.
- If you can't name at least 5 core ideas with High or Medium confidence, don't run it. Say so, and offer to run it once the reader pastes the contents page or a summary.
- Biographies, wisdom texts and art books: run it, but it only informs (outcome `info`) and never sets the Verdict; their value is in living with the book.

## Before asking (don't show any of this)
1. `get_source` (card, Verdict, earlier quizzes) and `get_reading_profile` (finished books). If the latest quiz is unfinished, offer to continue it and ask only the ideas it didn't cover.
2. Write a private outline: 5–8 core ideas, each marked Core (counts double) or Supporting. For each: what the book adds beyond common sense and beyond the popular summary, the common misreading, and the key points a full answer contains. Note any finished book that carries the idea.
3. Self books (the main book for something the reader is working on): add what doing it looks like in daily life.

## Asking
- Start with one line: the mode, the number of questions and the time, "short answers and 'don't know' are fine; answers come at the end", and which ideas books they've finished already cover (those get one light check each).
- **Scan first:** 5 questions on the core ideas and what the book adds beyond the summary, about 5 minutes. If the result is clearly high (8 or more) or clearly low (below 3), stop and score. Otherwise offer **Deep**: "Your result is in between: 6 more questions (about 7 minutes) to decide, or stop here?" Deep goes into the uncertain ideas; 15 questions at most in total. "Deep" at the start skips Scan.
- One question at a time. Mostly open questions: explain it in your own words · apply it to a situation where the intuitive answer is wrong according to the book · for Self books, "what did you actually do last time…?". Add one multiple-choice question whose wrong options are the popular misreadings.
- **Not guessable:** drop any question a thoughtful person who never met the book could answer well. Ask for the book's specific mechanism, concept, example or counter-intuitive claim.
- Never teach or hint in a question, and give no feedback between questions. A vague answer gets one follow-up; "don't know" moves on.
- **Save progress after every answer:** `save_quiz` with `partial: true`, the ideas graded so far and the score so far (Book Hub keeps one in-progress record per book). If the reader stops or leaves, Home offers to continue. Don't mention these saves to the reader.

## Grading each idea
Decide what a full answer contains before reading the reader's answer, so the same answers always get the same result. Judge the content, not the writing: short and right is Held.

| Result | When | Points |
|---|---|---|
| Held | explains it and applies it correctly | 3 |
| Known, not lived | explains it, but doesn't practise it | 2 |
| Partly | knows the name or the conclusion, not the why or how | 1 |
| New | doesn't know it, or has it wrong | 0 |

## Score: "You already know" (0–10)
- **Score** = 10 × sum of (weight × points) ÷ (3 × sum of weights), one decimal. Core ideas weigh 2, Supporting 1. High = the reader already holds the book.
- **Practice** (Self books only, 0–10): how much the reader actually does what the book teaches.

| Result | Outcome | Verdict |
|---|---|---|
| 8–10 | skip | Skip: they already hold it; the debrief is their summary |
| 5.5–7.9 | keep | Read parts: name the chapters where they missed (with a confidence label) |
| below 5.5 | keep | Read |
| Self book: score 7 or more, Practice below 5 | practise | Practise instead: name one practice |

- A Core idea scored New that no finished book carries → at least Read parts, whatever the score.
- A lasting book (Timeless: yes) whose ideas are "known, not lived" → Reread or Read parts, never Skip.
- The quiz sets the Verdict and Book Hub locks it. It never changes Quality, Timeless or Fit, and never the book's status.

## After a skip
Ideas left uncovered = ideas marked New or Partly. None → no replacement needed. Some → suggest at most 2 books that carry them (books with Verdict Idea only or Bench in Book Hub first). Never add anything to the Buy list.

## Ending
1. One line: **You already know: X/10** → outcome and Verdict (plus Practice for Self books).
2. A table: idea · their result · the right answer in one line · covered by.
3. **What's new for you** in 2–3 lines; for a skip, the ideas left uncovered and any replacement.
4. Save the final result with `save_quiz` (no `partial`; score, ideas, outcome, verdict, and the debrief as `summary`). End with the Book Hub link.
