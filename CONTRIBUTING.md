# Contributing

Thanks for your interest in Book Hub! It's maintained in spare time: **issues are reviewed about once a month, bugs sooner.**

## Reporting a bug or an idea

[Open an issue](../../issues/new/choose). For bugs, say what you did, what you expected and what happened, plus your AI app (e.g. Claude on iPhone). **Never include secrets**, tokens or personal library data.

## Changing the code

1. **Open an issue first** describing the change, so we can agree on the approach before you spend time on it.
2. Fork, then make a branch.
3. Run `npm install`, copy `.dev.vars.example` to `.dev.vars` and fill in dummy values.
4. Make your change. Keep pull requests small, one change each.
5. Run `npx tsc --noEmit` and `npm test`. Both must pass; GitHub runs them too.
6. For UI changes, run `scripts/preview.sh` and look at every page at both widths. Add screenshots to the pull request.
7. Add a line to `CHANGELOG.md` under a new "Unreleased" heading.

Using an AI coding assistant is fine. Please say so in the pull request, and make sure you understand and have tested every change. [AGENTS.md](AGENTS.md) has notes for coding agents.

## Changes that get extra care

- **Rules (`rules/`), skills (`skills/`) and connector tool descriptions** are instructions an AI follows. Changes to them are reviewed as carefully as code, because a small wording change can change behaviour for everyone.
- **New connector tools**, especially anything that writes data. Book Hub deliberately has no delete tools, and the AI can't change rules.
- **Database migrations:** add a new file, never edit a released one.

## Code of conduct

Be kind and assume good intent.
