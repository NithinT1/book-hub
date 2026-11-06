# Changelog

All notable changes to Book Hub. Versions follow [semantic versioning](https://semver.org): a major version can change how things work, a minor one adds features, a patch fixes bugs.

Each entry says whether you need to **re-upload skills** or **reconnect the connector** after updating (see [Updating](docs/SETUP.md#updating)).

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
