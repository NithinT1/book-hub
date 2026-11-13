# Changelog

All notable changes to Book Hub. Versions follow [semantic versioning](https://semver.org): a major version can change how things work, a minor one adds features, a patch fixes bugs.

Each entry says whether you need to **re-upload skills** or **reconnect the connector** after updating (see [Updating](docs/SETUP.md#updating)).

## [2.10.1] — Book Quiz on Home

### Added
- **Book Quiz** button in Home's Ask AI, next to Book details. Type a book name and tap it to start `/book-quiz` for that book.

## [2.10.0] — Pins

### Added
- **Pin to focus:** pin up to 5 books from My shelf (Reading or Not started). Pins sit on top of My shelf in your order (▲▼ to reorder) and come first in Home's "Reading now". Pin and unpin from ⋯ or the book page. With 5 pinned, the hub shows your pins so you can swap one. A pinned book unpins itself when you finish it, give it away or archive it.

## [2.9.0] — Book Quiz

**After updating:** upload the new `book-quiz` skill, and reconnect the connector (a new tool, `save_quiz`). Coming from 2.7, also re-upload the other skills (see 2.8.0).

### Added
- **Book Quiz** (`/book-quiz`): questions on a book's core ideas, then **"You already know: X/10"** and a Verdict (Skip, Read parts, Read, or the new **Practise instead**). Scan first (5 questions), Deep only when the result is unclear.
- Quiz results on the book page (score, idea by idea, what's left for you, history), a "Quiz me" item under ⋯, a Quiz filter in Discover (quizzed skips are hidden), and **Finish your quiz** on Home for quizzes stopped midway.
- **Search on every page:** 🔍 in the top bar (or press **/** on a laptop). Results show your books first, then Archived & Skipped books in their own section, only when they match. Home now starts with Ask AI. Discover's tab icon is now a compass.

## [2.8.0] — Quality, Fit and Verdict

**After updating:** re-upload all skills once, and reconnect the connector (Settings → Connectors → Book Hub → Disconnect, then Connect). Skills now ask the hub for their rules, so later rule changes won't need a re-upload.

### Added
- **Three answers and one decision for every book:** Quality /10 (is it a good book?), Timeless (has it lasted?), Fit /10 with a General or Self label (is it right for you?), and a saved **Verdict**: Read, Read parts, Reread, Idea only, Bench or Skip, plus how to get it.
- **Book page strip** with Status, Verdict, Timeless, Quality and Fit, and "Why these scores" (factors, the belief a book breaks, the mistake it prevents, Verdict history).
- **Your own verdict:** set it on the book page; it's locked until you unlock it.
- **Profile & settings, regrouped:** About me as a reader · How I judge books · Settings · System rules. Every rule has three views (in plain words, rule text, history), says where it's used, and can be reset to the starter.
- **Non-fiction profile** in 8 guided sections: why you read, subjects in and out, what you're working on, values, what makes a book worth it, deal-breakers, originals vs modern books, reading time.
- **Quality rules you can tune:** turn gates on or off and change factor weights in a form.
- **Home set-up card** for new hubs (connect, about me, add your shelf); a pointer from Discover to Ask AI; Discover filters for Verdict and General/Self; "Best first" now uses Quality × Fit; a note on Buy list books whose Verdict changed.

### Changed
- Rules renamed for clarity: `fiction-taste` → `fiction-profile`, `nonfiction-taste` → `nonfiction-profile`, `buy-decision` → `buying-preferences`. The timeless test is now part of `quality-nonfiction`. Your edits and history move with them.
- Ranking: your library never changes the order of a list; it only labels books and flags overlap.
- Earlier buy decisions become each book's starting Verdict.

## [2.7.0] — first public release

Earlier versions were private.

### What's included
- **Connector** for AI chat apps (MCP) with GitHub sign-in, owner only, and no delete tools.
- **Hub website:** Home, Discover (filters, "Best first" order), Buy list (with "At a bookstore now?" checks), My shelf, Notes (notes, reviews, discussions, summaries), Profile & settings.
- **Seven statuses** that move with what you do: Not decided → Buy list → Not started → Reading → Finished, plus Archived and Given away.
- **Recommendations and book details** with Fit, the timeless test, and ratings, prices and endorsements always linked and dated, or "couldn't fetch".
- **★ Most featured:** books that keep coming up across separate requests.
- **Reviews** with labelled fields, rating 0–10 and "would you re-read?"; notes with chapter or page.
- **Your taste:** a form for fiction, non-fiction and buying preferences that sharpens Fit scores.
- **Editable rules** with full version history.
- **Currency setting** with built-in approximate rates; **AI app setting** (Claude, ChatGPT, or copy the request for another app).
- **Export** as Markdown or JSON, plus an optional weekly backup script.
- **Skills** for Claude: `/book-recs`, `/book-details`, `/book-summary`, `/book-discuss`, `/book-store`, `/book-shelf`, `/book-checkin`, `/book-hub-feedback`.
