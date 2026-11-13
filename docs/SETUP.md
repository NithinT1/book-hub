# Setting up Book Hub

This guide sets up your own Book Hub: about **30–45 minutes, once**. Every step says what to do, why, and what can go wrong.

> **Two ways to do it**
> - **[Path A: with Claude Code](#path-a-let-claude-code-set-it-up)** (recommended). Claude Code runs the commands and tells you exactly what to click. Included with Claude Pro.
> - **[Path B: by hand](#path-b-step-by-step-by-hand)**. Every step written out. No coding needed, but you'll copy a few commands into a terminal.
>
> Both end the same way: [connect your AI app](#connect-claude) and [upload the skills](#upload-the-skills).

---

## Before you start

| You need | Why | Notes |
|---|---|---|
| A **GitHub account** (free) | Your copy of the code lives here, and you sign in to your hub with it | [github.com/signup](https://github.com/signup) |
| A **Cloudflare account** (free) | Your hub and its database run here | [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No card needed for the free plan. |
| **Claude Pro** or above | Custom connectors and skills need a paid plan | Other AI apps: see [Other AI apps](#other-ai-apps) |
| A **computer** with **Node.js 20 or newer** | To run the one-time setup | Download the "LTS" version from [nodejs.org](https://nodejs.org) and install it like any app |
| **Git** | To download the code and get updates | Mac: comes with Xcode tools (the first `git` command offers to install it). Windows: [git-scm.com](https://git-scm.com) |

> ⚠️ **Stay at your computer during setup.** Two steps open a browser and wait for you to click "Allow". If you're away for more than a couple of minutes, they time out and you'll need to run them again.

> 🔒 **Never paste a secret (a password, key or token) into an AI chat**, including Claude Code. The guide always has you type secrets into a hidden prompt or the Cloudflare dashboard.

### Your hub's address

Your hub will live at:

```
https://book-hub.<your-subdomain>.workers.dev
```

`<your-subdomain>` is your Cloudflare account's workers.dev name. To pick or see it: Cloudflare dashboard → **Workers & Pages**. The first visit asks you to choose one, and the setup commands below also prompt for it. Have a second choice ready in case your first is taken. **Write the full address down; you'll use it several times.**

---

## Path A: let Claude Code set it up

1. **Make your own copy of the code.** On this project's GitHub page, click **Fork** → **Create fork**.
   *Why a fork:* updates are one click later ("Sync fork").
2. **Install Claude Code**, following the [official guide](https://docs.claude.com/en/docs/claude-code/setup). Sign in with your Claude account.
3. **Download your fork** (replace `YOUR-GITHUB-NAME`) and start Claude Code in it:
   ```bash
   git clone https://github.com/YOUR-GITHUB-NAME/book-hub.git
   cd book-hub
   claude
   ```
   When Claude Code asks whether you trust this folder, answer **Yes**. It's your own copy.
4. **Paste this prompt:**
   ```
   Set up Book Hub for me by following docs/SETUP.md, Path B, step by step. Explain each step in plain
   words before doing it, run the commands for me, and stop whenever I need to do something in a browser
   and tell me exactly what to click. Never ask me to paste a secret into this chat: tell me which command
   to run myself so I can type it into the hidden prompt.
   ```
5. Follow along. When it finishes, continue with **[Connect Claude](#connect-claude)**.

---

## Path B: step by step, by hand

Open a terminal: **Terminal** on Mac, **PowerShell** on Windows. Type or paste each command and press Enter.

### 1. Get the code

On this project's GitHub page, click **Fork** → **Create fork**. Then:

```bash
git clone https://github.com/YOUR-GITHUB-NAME/book-hub.git
cd book-hub
npm install
```

`npm install` downloads the tools Book Hub needs. It takes about a minute and may print warnings (for example about "allow-scripts"); they're normal.

### 2. Sign in to Cloudflare

```bash
npx wrangler login
```

A browser tab opens. Click **Allow**. The terminal then says you're logged in.

> ⚠️ If it says the login timed out, run the command again and click Allow straight away.

### 3. The database and sign-in storage

Nothing to do here: Cloudflare creates both automatically the first time you put your hub online (step 6).

*What they are:* the database holds your library, notes and rules. The second store holds sign-in tokens for your AI app.

### 4. Create the GitHub sign-in app

This lets you, and only you, sign in to your hub with GitHub.

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App** ([direct link](https://github.com/settings/applications/new)).
2. Fill in:

   | Field | Value |
   |---|---|
   | Application name | `Book Hub` |
   | Homepage URL | `https://book-hub.<your-subdomain>.workers.dev` |
   | Authorization callback URL | `https://book-hub.<your-subdomain>.workers.dev/callback` |

   Leave **Enable Device Flow** unticked. Click **Register application**.
3. On the next page, copy the **Client ID** somewhere handy. It isn't secret.
4. Click **Generate a new client secret**. Leave this page open: you'll need the secret in the next step, and GitHub shows it only once.

> ⚠️ The callback must be exactly your hub address plus `/callback`, with `https://` and no trailing slash. One wrong character gives a "redirect_uri" error when you sign in.

### 5. Add your secrets

Run each command below. Each one asks for a value **in a hidden prompt**: paste it and press Enter. Nothing is shown on screen; that's normal.

| Command | What to paste |
|---|---|
| `npx wrangler secret put GITHUB_CLIENT_ID` | The Client ID from step 4 |
| `npx wrangler secret put GITHUB_CLIENT_SECRET` | The client secret from step 4 |
| `npx wrangler secret put OWNER_GITHUB_LOGIN` | **Your GitHub username**, exactly as on your profile. Only this account can sign in. |
| `npx wrangler secret put COOKIE_ENCRYPTION_KEY` | A long random string (see below) |
| `npx wrangler secret put EXPORT_TOKEN` | Another long random string (see below). Used only by the optional backup script. |

To make a long random string, run this and copy what it prints. Do it twice, once for each:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> The first command asks *"There doesn't seem to be a Worker called book-hub. Do you want to create a new Worker…?"* Answer **yes**.

### 6. Put your hub online

```bash
npm run deploy
```

This sets up the database tables, then publishes your hub. At the end it prints your hub's address.

**Check it:** open the address in your browser → **Sign in with GitHub** → **Authorize**. You should see your (empty) Book Hub. 🎉

> ⚠️ "This Book Hub belongs to someone else" after signing in means `OWNER_GITHUB_LOGIN` doesn't match your GitHub username. Run step 5's command for it again, then `npm run deploy`.

---

## Connect Claude

1. Go to [claude.ai](https://claude.ai) → **Settings → Connectors → Add custom connector**.
2. Name: `Book Hub`. URL: your hub address plus `/mcp`:
   ```
   https://book-hub.<your-subdomain>.workers.dev/mcp
   ```
   Leave the advanced options as they are. Click **Add**.
3. Click **Connect**. A GitHub page asks you to authorize. Click **Authorize**.
4. **Set the tools to "Always allow"**: Settings → Connectors → Book Hub → each tool's dropdown → **Always allow**.
   *Why:* otherwise Claude asks permission every time it saves a book. It's safe: Book Hub has no delete tool, so Claude can only add and update.
5. In any chat, make sure **Book Hub** is switched on: **+** → **Connectors**.

## Upload the skills

Skills are short instructions that add commands like `/book-recs` to Claude.

1. Download **`book-hub-skills.zip`** from this project's [latest release](../../../releases/latest) and unzip it. It contains one `.zip` file per skill.
   *(Or zip each folder inside `skills/` yourself.)*
2. claude.ai → **Settings → Capabilities → Skills → Upload skill**. Upload each `.zip` file.
3. Make sure each skill is switched on.

| Command | What it does |
|---|---|
| `/book-recs` | Recommendations on a topic, a question, a link, or "books like X" |
| `/book-details` | Full details, ranking and buy decision for named books |
| `/book-summary` | A 30–60 minute summary instead of the book |
| `/book-discuss` | Go deep on a chapter or idea while reading |
| `/book-store` | At a bookstore: price check one book, or find gems on a rack photo |
| `/book-shelf` | Add books from shelf photos, or decide what to give away |
| `/book-checkin` | Monthly: what to read next, plus anything pending |
| `/book-hub-feedback` | Report a problem or an idea to your own hub's Feedback inbox |

## Check that everything works

1. New chat in Claude: `/book-details The Hobbit`. You should get a card, and the book appears in your hub under **Discover**.
2. **Phone:** open the Claude app (same account) and try `/book-recs short books that make you curious`. Connectors and skills carry over automatically.
3. In the hub, open the book → **Add to buy list**. It shows on your **Buy list**.
4. *Optional:* Profile & settings → **About me as a reader** (or the set-up card on Home).

> 📱 **Tip:** on your phone, open your hub address in the browser → **Share → Add to Home Screen**. It then opens like an app.

---

## Updating

When a new version comes out (see the [changelog](../CHANGELOG.md)):

1. On your fork's GitHub page, click **Sync fork → Update branch**.
2. On your computer, in the `book-hub` folder:
   ```bash
   git pull
   npm install
   npm run deploy
   ```
3. If the changelog says **skills changed**: upload the changed ones again. When Claude says *"A skill with this name already exists"*, choose **Replace**, not Skip.
4. If the changelog says **tools changed**: claude.ai → Settings → Connectors → Book Hub → **Disconnect**, then **Connect**. Set any new tools to **Always allow**, then start a new chat.

Your library, notes and rules aren't touched by updates. Rules you've edited in the hub are always kept.

---

## Troubleshooting

| What you see | Why | What to do |
|---|---|---|
| `wrangler login` times out | The browser approval waited too long | Run it again; click **Allow** straight away |
| Your workers.dev name is taken | Names are first come, first served | Pick another one in Cloudflare → Workers & Pages |
| "redirect_uri is not associated with this application" | The GitHub callback URL doesn't match | It must be exactly `https://book-hub.<your-subdomain>.workers.dev/callback` |
| "This Book Hub belongs to someone else" after signing in | `OWNER_GITHUB_LOGIN` isn't your exact GitHub username | Set it again (step 5), then `npm run deploy` |
| Claude doesn't see Book Hub in a chat | The connector is off for that chat | **+** → Connectors → switch **Book Hub** on |
| Claude asks permission on every save | The tools aren't set to Always allow | Settings → Connectors → Book Hub → **Always allow** for each tool |
| After an update, Claude still behaves the old way | Claude remembers the old tool list | **Disconnect → Connect** the connector, then a new chat |
| "A skill named … already exists" | You're uploading a newer version | Choose **Replace** (not Skip) |
| Claude asks what to do with a pasted list of books | No command told it which job to do | Start with a command, e.g. `/book-details` followed by the list |
| GitHub asks for a password on your phone | You normally sign in to GitHub another way | Use the same method, e.g. "Continue with Google" |
| `npm run deploy` can't create the database | Automatic creation isn't available on your account | Run `npx wrangler d1 create book-hub` and `npx wrangler kv namespace create OAUTH_KV`, paste the two ids into `wrangler.jsonc` (`database_id` and `id`), then deploy again |
| A Cloudflare error page instead of your hub | Possibly a free-plan daily limit (rare) | Check Cloudflare → Workers & Pages → book-hub → Metrics. If a limit was reached, wait until the next day; nothing is lost or billed |

Still stuck? [Open an issue](../../../issues) with what you did and what you saw. Never include secrets.

---

## Other AI apps

These haven't been tested yet. If you try one, please share how it went in an issue.

**ChatGPT** (Plus and above, on the web):
1. Settings → **Apps** → Advanced settings → turn on **Developer mode**.
2. **Create app**: name `Book Hub`, URL `https://book-hub.<your-subdomain>.workers.dev/mcp`, then sign in with GitHub when asked.
3. ChatGPT asks you to confirm each save, and there are no skills on Plus. In your hub, set **Settings → AI app → ChatGPT**: the hub's buttons then open ChatGPT with the request in plain words, telling it which Book Hub rules to follow.

**Gemini** (Google AI Pro, where "custom apps" are available):
1. gemini.google.com → Settings → **Connected apps → Add a custom app** → your `/mcp` address → sign in with GitHub.
2. In your hub, set **Settings → AI app → Another AI app**: the buttons copy the request for you to paste.

## Optional: weekly backup to your computer

`scripts/backup-export.sh` saves your whole library as one Markdown file, for example into an Obsidian vault. Instructions are at the top of the script. On a Mac it can run every week with `scripts/book-hub-backup.plist.example`. You can also download a copy any time: hub → Settings → **Download as Markdown**.
