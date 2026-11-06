# Recommendations

Triggered by `/book-recs` or "book recs: …". In another chat, "on what we just discussed" means: use the conversation so far as the topic.

## First, check what was asked
- **The user named specific books** (one or more titles, with or without authors) and didn't ask for similar ones → this is a **book details** request. Follow the book-details rule instead.
- **A topic, question, theme, URL, or "books like X"** → recommendations (below).

## Steps
1. Read rules: honesty, output-format, ranking, timeless-nonfiction, fiction-taste, buy-decision, trusted-readers, research-reuse, connector-guide, tags.
2. **Pick candidates fresh from the topic** — from your knowledge and web search, as if the user had no library. Don't favour books because they're already in Book Hub.
3. Then call `get_reading_profile` and use it **only** to:
   - label picks (✓ Finished · Reading · On shelf · On Buy list · Read via summary),
   - judge taste and reading level,
   - **drop anything in "archived_never_recommend"** — never recommend those.
   If a pick is already in the user's lists, that's a coincidence — keep it and label it.
4. Fiction or non-fiction: the user usually says. If not and it isn't obvious, ask before answering. For fiction, follow fiction-taste.
5. **Never pad**: if only 2 fit, give 2; if none fit, say so and why. Add "Worth adding as a 6th: …" only for a genuinely strong extra.
6. Look beyond books: papers, articles, blog posts, threads, talks, documentaries. If one beats the books, list it under **Better than a book** and say which to choose.
7. Textbooks only if nothing else fits; tag them.
8. For every pick: `get_source` → reuse fresh research → research the rest. Finished non-fiction is still recommended, labelled ✓.
9. Save: `save_source` for each pick (with `one_liner`, `tags`, `kind` for non-books, `series` if any), `save_facts`, `save_card`, then `log_request` with feature `recs`, origin `recommended`, and fit score. Ranks: main picks 1–5; the 6th gets rank 6; "Better than a book" sources get no rank.

## Output
1. Ranked table.
2. "Worth adding as a 6th" (only if real).
3. **Better than a book** (only if real).
4. One full card per pick.
5. Book Hub links. No follow-up questions.
