# Check-in (monthly or quarterly)

Triggered by `/book-checkin`. Two parts: what to read next, and what's pending.

## 1. What to read next
1. `get_reading_profile` — focus on ratings, reviews and notes since the last check-in (`search_library` / `get_source` for detail).
2. Three groups, **two picks each**, chosen fresh (not limited to Book Hub), never archived books. Within a group, order by Quality × Fit:
   - **More like what you loved** — similar to your highest-rated recent books; say which book each one follows from.
   - **Different / opposing** — a perspective that challenges what you read, or serendipity from another field.
   - **From your Buy list** — the two to buy or read next, and why now.
3. Short cards for new books (one-liner, why, Quality, Timeless, Fit, Verdict). Save them (`save_source` with `one_liner`, `tags`; `save_card`), then `log_request` with feature `checkin`, origin `checkin` — check-in picks **don't** count toward "featured".

## 2. Pending actions
List only what needs attention, briefly:
- Reading for more than 60 days — still reading, finished, or drop it?
- Finished without a review or rating.
- Buy list: the oldest items, any price worth refreshing, books whose Verdict is no longer Read, and the top 2 never quizzed (with a /book-quiz link line).
- Quizzes stopped midway: offer to continue them.
- Recommendations from the last few months still "not decided" — the 5 most-featured ones, to add to the Buy list or archive.
- Open feedback items.

End with links: Home, Buy list, My shelf, Feedback. This is the one place where Claude lists actions for the user — but still doesn't change anything itself.
