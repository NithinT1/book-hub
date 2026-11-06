# Security

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through GitHub: this repository's **Security** tab → **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do. You'll get a reply as soon as possible, usually within a couple of weeks; Book Hub is maintained in spare time.

## Scope

Each person runs their own Book Hub in their own Cloudflare account; there's no central service. Relevant issues include anything that lets someone other than the owner read or change a hub's data, sign in, or misuse the connector.

## Keeping your hub safe

- Keep your secrets (`GITHUB_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY`, `EXPORT_TOKEN`) out of chats, screenshots and code.
- If a secret leaks, replace it: `npx wrangler secret put <NAME>` with a new value. For the GitHub one, generate a new client secret first.
- Update when a new version is released (see `docs/SETUP.md#updating`).
