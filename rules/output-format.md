# Output format

## 1. Ranked table (always first when there's more than one book)
| Rank | Name | Type | Year | Match | Quality | Timeless | Fit | Verdict | In Book Hub |

- Type: Fiction · Non-fiction · Biography · Autobiography (add "Textbook" when relevant).
- Quality: score /10 and tier. Fit: score /10 and label (General + Self · Self · General).
- In Book Hub: ✓ Finished · Reading · On shelf · On Buy list · Read via summary · ★ Most featured, or blank.
- Always ranked: most relevant first (see the ranking rule).

## 2. One card per source
Layout: one field per paragraph, `**Label:** text`, with a blank line between fields, so it reads well in chat and in the hub.

0. **In one line:** spoiler-free, what it is and why it's interesting.
1. **For this question:** one line on what to do now for this request (e.g. "Reread chapters 2–3; you own it"). Not saved as the Verdict.
2. **Verdict:** Read / Read parts / Reread / Idea only / Practise instead / Bench / Skip / Not sure, how to get it, and one line why (verdict rule).
3. **Quality:** score /10, tier and confidence, with the factor scores in one line (quality rule). Name the belief it breaks and the mistake it prevents when you can.
4. **Timeless:** verdict + 2–3 lines of reasoning (Classic status for fiction).
5. **Fit:** score /10, label and a one-line reason naming the goal or subject (fit rule).
6. **Author:** who, and credible? Why? No sugar-coating.
7. **Core idea:** 1–2 lines (3–5 only if it can't be condensed). Fiction: premise only, no spoilers.
8. **Weaknesses:** gaps, what it over- or under-assumes. Name the strongest critic if there is one.
9. **How it differs:** from named similar books.
10. **Ratings:** Amazon and Goodreads, with number of raters, link and date; else "couldn't fetch". Claude's rating (0–10) separately labelled.
11. **Price:** new copy, in the user's currency, with link and date.
12. **Endorsements:** who recommended it, each with a link.
13. **Past appearances:** from Book Hub.
14. **Pages · difficulty:** with source.
15. **Which translation:** only for classics and translated works: the one to pick for this reader, and why.
16. **Series:** only if it's part of one: "Book N of M in …; read Book 1 first?"
17. **Strongest opposing book.**

## 3. End with links, not questions
Finish with the Book Hub links for the books (from `hub_url`) and, where relevant, the Buy list. Offers that take time go as link lines (handover rule): a long summary for Idea only; and for non-fiction not yet finished whose Verdict is Read, Read parts or Bench, and that is long (over about 10 hours) or overlaps a book the reader has finished: "Not sure you need it? Book Quiz, about 5–10 min: /book-quiz <title>". No "shall I add it to your list?" or other follow-up questions.
