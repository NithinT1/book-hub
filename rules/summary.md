# Long summary

Triggered by `/book-summary` or "book summary: …". A summary the user can read in 30–60 minutes **instead of the book**, so it has to stand on its own: the ideas, the book's best examples, pictures where they help, and an honest word on what it can't replace.

## Before writing
1. **Model check:** this works best on the most capable model with extended thinking. If you know you're a smaller or faster model, or thinking is off, say so in one line and offer to continue anyway.
2. `get_summary` for the book. If one exists, **improve it** by default: keep what works, add what's missing, fix mistakes, and use any feedback the user gives. Write from scratch only when the user asks for a fresh one.
3. Read the user's profile (`nonfiction-profile` or `fiction-profile`) for "What this means for you".

## Research (you don't have the book)
Assume the user has no notes and you have no copy of the book. Build the summary from:
- What you know of the book. Mark anything recalled rather than checked (figures, dates, distances, percentages) as "recalled".
- Web research: serious reviews and critiques, the author's interviews and talks, the publisher's pages and sample chapters, previews, lecture notes.
- **Full text only from legal sources:** public-domain editions (e.g. Project Gutenberg), the publisher's free samples, the author's own site. Never use pirated PDFs or EPUBs.
- Pages, photos or highlights the user shares.

## Quotes and examples
- Exact quotes only from a source you can link (a legal full text, a sample, a review that quotes it, the user's pages). Keep each under about 50 words and give the source. Never present recalled wording as exact.
- Retell the book's best examples and stories in your own words, clearly as retelling. They carry the book's flavour; use plenty.

## Pictures
Use pictures where they explain better than words (structures, processes, maps, timelines, comparisons):
- **Your own diagrams:** draw them as SVG and embed as `![Short title](data:image/svg+xml;base64,…)` on their own line, then an italic caption line starting "Figure N." Keep them simple, with readable text and explicit fills.
- **Pictures from the web:** only ones free to reuse (public domain, Wikimedia Commons, the publisher's cover, official photos of real places or people), as `![Short title](https://…)` with the source in the caption.
- **The book's own figures and photos are copyrighted:** describe them and link to where they can be seen; don't copy them.

## Structure
Start with `# <Book title>`, then these `##` sections in this order (the hub turns them into the contents list):
1. **Can this summary replace the book?** Two or three lines: to get the ideas (x/10), to use the book in practice (x/10), and the verdict (yes / read parts / read it).
2. **The book in one paragraph:** the core argument and who it's for.
3. **Grand summary:** the whole argument, connected, in plain words, with pictures.
4. **Chapter by chapter** (or part by part): each one's point and its best example. Say so if you're unsure of order or content.
5. **What this means for you:** link the ideas to the user's goals and subjects from their profile, and to books they've read (`search_library`). Give one thing to try. If the profile is empty, say what you'd need to know.
6. **Key ideas to keep:** 5–10, each with how to use it.
7. **Quotes:** short exact quotes with sources, per the rules above.
8. **Critique:** weaknesses, what it over- or under-assumes, the strongest opposing book.
9. **Originality check:** original thinking, solid research, the author's experience, or borrowed? Name the sources it draws on and be blunt.
10. **Should I still read the full book?** Yes / no / only chapters X–Y, and why.
11. **Recap:** the 5 ideas to remember, one line each. Then offer the Book Quiz to check what stuck.
12. **Did this summary do the book justice?** Score it honestly for both goals (getting the ideas; using the book) out of 10, say what's missing, and give confidence (High / Medium / Low) with why.
13. **Sources:** the links you used.

Aim for depth: several thousand words. On long books, write it in parts so nothing gets cut off, then save it once.

## Saving
Save with `save_summary` once written; each save is a new version and older ones are kept. A summary doesn't change the book's status; don't ask whether to archive it. End with the Book Hub link to the summary.
