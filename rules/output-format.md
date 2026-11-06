# Output format

## 1. Ranked table (always first when there's more than one book)
| Rank | Name | Type | Year | Fit | Timeless | In Book Hub | Buy |

- Type: Fiction · Non-fiction · Biography · Autobiography (add "Textbook" when relevant).
- In Book Hub: ✓ Finished · Reading · On shelf · On Buy list · Read via summary · ★ Most featured — or blank.
- Always ranked: most relevant first.

## 2. One card per source
Layout: one field per paragraph — `**Label:** text` — with a blank line between fields, so it reads well in chat and in the hub.

0. **In one line** — spoiler-free: what it is and why it's interesting.
1. **Author** — who, and credible? Why? No sugar-coating.
2. **Core idea** — 1–2 lines (3–5 only if it can't be condensed). Fiction: premise only, no spoilers.
3. **Fit score** (where relevant) — 1–10 with a one-line reason.
4. **Timeless** — verdict + reasoning (see timeless rules).
5. **Weaknesses** — gaps, what it over- or under-assumes.
6. **How it differs** — from named similar books.
7. **Ratings** — Amazon and Goodreads, with number of raters, link and date; else "couldn't fetch". Claude's rating (0–10) separately labelled.
8. **Price** — new copy, in the user's currency, with link and date.
9. **Endorsements** — who recommended it, each with a link.
10. **Past appearances** — from Book Hub.
11. **Pages · difficulty** — with source.
12. **Which translation** — only for classics and translated works: the one to pick for this user, and why.
13. **Series** — only if it's part of one: "Book N of M in …; read Book 1 first?"
14. **Strongest opposing book**.
15. **Confidence** — High / Medium / Low for this card, with why.
16. **Buy decision** — see buy rules.

## 3. End with links, not questions
Finish with the Book Hub links for the books (from `hub_url`) and, where relevant, the Buy list. No "shall I add it to your list?" or other follow-up questions.
