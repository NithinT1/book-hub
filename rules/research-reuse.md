# Reusing saved research

Book Hub stores every card and researched fact with its date. Reuse it to save time and usage; refresh only what's stale.

Before researching a book, call `get_source` (or `lookup_book`). It returns the saved card and facts with `age_days`.

| Item | Reuse if younger than |
|---|---|
| Full card (author, core idea, timeless, weaknesses…) | 180 days |
| Price | 30 days |
| Amazon / Goodreads ratings | 90 days |
| Endorsements | 365 days |

- When reusing, show the date: "price checked 12 days ago".
- When refreshing, save the new values with `save_facts`, and the updated card with `save_card`.
- If the user says "refresh", research everything again.
