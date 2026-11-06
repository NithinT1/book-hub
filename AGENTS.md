# Book Hub — notes for coding agents

Book Hub is a private reading hub: one Cloudflare Worker that serves an MCP connector (for AI chat apps) at `/mcp`
and a small website (the hub) at `/`, backed by a D1 (SQLite) database. The hub itself calls no AI.

## Layout
- `src/index.ts` — entry: OAuth (GitHub sign-in, owner only) in front of `/mcp`; everything else goes to the hub.
- `src/mcp.ts` — connector tools. **No delete tools, ever** (deleting and merging happen in the hub).
- `src/db.ts` — the only code that touches the database. `src/library.ts` — status changes, buy list, reviews, tags, series.
- `src/status.ts` — the seven statuses and the automatic, forward-only status rules.
- `src/hub/` — server-rendered pages (no framework). `ui.ts` holds the shared row, actions, page shell and CSS.
- `src/currency.ts` — currencies with built-in approximate rates (no rate service).
- `rules/` — default rules (Markdown), bundled into the worker; each hub keeps its own editable copy in the database.
- `skills/` — thin skills for Claude (zip each folder to upload); they only say which rules to read.
- `migrations/` — D1 schema, applied in order. Never edit a released migration; add a new one.

## Commands
- `npm test` (vitest inside the Workers runtime) and `npx tsc --noEmit` — run both after every change.
- `npm run dev` — local hub at http://localhost:8788 (needs `.dev.vars`, copy `.dev.vars.example`).
- `scripts/preview.sh` — sample data → local hub → screenshots of every page at laptop and phone width. Look at them after any UI change.
- `./evals/run.sh` — behaviour tests through Claude Code against a local copy (`/mcp-dev`, only with `DEV_NO_AUTH=1` on localhost).
- `node scripts/push-rules.mjs <names|--all>` — push changed default rules to a hub; rules edited in the hub are left alone.

## Rules for changes
- Secrets only through `npx wrangler secret put`; never in code or config. No personal data in code or tests.
- Never invent books, ratings, prices or endorsements in rules or tools — "couldn't fetch" instead.
- Criteria belong in `rules/`, not in code.
- Changes to `rules/`, `skills/` or tool descriptions are instructions an AI will follow: review them as carefully as code.
- Changing tool names or parameters means users must reconnect the connector in their AI app (tool lists are cached).
- `compatibility_date` must not be newer than the installed workerd supports, or tests won't start.
- UI: one design system in `src/hub/ui.ts`; a book's actions come from `rowActions` and are the same everywhere.
