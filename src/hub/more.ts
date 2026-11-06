// More tab: rules, feedback, settings (export, usage, test results), and the More menu itself.

import { Hono } from "hono";
import { getCurrency, getRuleHistory, getRules, listFeedback, listTestRuns, resolveFeedback, saveFeedback, saveRule, setSetting } from "../db";
import { CURRENCIES, isCurrency, RATES_AS_OF } from "../currency";
import { buildJsonExport, buildMarkdownExport } from "../export";
import { renderMarkdown } from "../markdown";
import { readTaste, TASTE, writeTaste } from "../taste";
import { ensureDefaultRules, ruleTitle } from "../rules-defaults";
import { COMMANDS } from "./lists";
import { AI_APPS, esc, isAiApp, layout, type HubEnv } from "./ui";

export const more = new Hono<HubEnv>();

more.get("/more", (c) =>
	c.html(
		layout(c, "more", "Profile & settings", `
<p class="muted">Signed in as <strong>${esc(c.get("login"))}</strong> (GitHub)</p>
<ul class="cards">
${[["/taste", "Your taste", "Fiction, non-fiction and how you like to get books — sharpens Fit scores"], ["/add", "Add a book", "Find it on Open Library and add it to your shelf or Buy list"], ["/rules", "Rules", "The criteria your AI follows — edit any time"], ["/feedback", "Feedback", "Problems and change requests"], ["/requests", "All requests", "Everything you've asked your AI"], ["/settings", "Settings", "AI app, currency, export and backup, usage, connection"]]
	.map(([href, label, sub]) => `<li class="book"><a class="row" href="${href}"><span class="row-text"><strong>${label}</strong><span class="muted">${sub}</span></span></a></li>`)
	.join("")}
<li class="book"><div class="row"><span class="row-text"><strong>Kindle integration <span class="tag star">Coming soon</span></strong><span class="muted">Bring in your Kindle library and highlights automatically.</span></span></div></li>
</ul>
<section class="panel"><h2>Commands for Claude</h2><div class="table-wrap"><table class="commands"><tbody>${COMMANDS.map(([cmd, what]) => `<tr><td>${cmd}</td><td>${esc(what)}</td></tr>`).join("")}</tbody></table></div></section>
<p><a class="btn secondary" href="/logout">Sign out</a></p>`),
	),
);

// ---- Your taste ----------------------------------------------------------------

more.get("/taste", async (c) => {
	await ensureDefaultRules(c.env.DB);
	const rules = await getRules(c.env.DB, TASTE.map((t) => t.rule));
	const body = (name: string) => rules.find((r) => r.name === name)?.body ?? "";
	const groups = [...new Set(TASTE.map((t) => t.group))];
	const fields = (group: string) =>
		TASTE.filter((t) => t.group === group)
			.flatMap((t) => {
				const values = readTaste(t, body(t.rule));
				return t.fields.map(
					(f) => `<label class="field">${esc(f.label)}<textarea name="${esc(`${t.rule}|${f.heading}`)}" rows="${f.rows}" placeholder="${esc(f.placeholder)}">${esc(values[f.heading].replace(/\*\*/g, ""))}</textarea></label>`,
				);
			})
			.join("");
	return c.html(
		layout(c, "more", "Your taste", `
${c.req.query("saved") ? `<p class="notice">Saved. Your next request in any chat uses it.</p>` : ""}
<p class="muted">Tell your AI what you enjoy. It's used for the <strong>Fit</strong> score and to rank recommendations — never to change the facts, the timeless verdict or the evidence. Write in your own words; leave anything blank. You can change it any time, and every earlier version is kept (Rules page).</p>
<p class="muted">✨ An AI interview to set this up for you is coming soon.</p>
<form method="post" action="/taste" class="stack review-form">
${groups.map((g) => `<section class="panel stack"><h2>${esc(g)}</h2>${fields(g)}</section>`).join("")}
<p><button class="btn">Save my taste</button> <a class="muted" href="/more">Cancel</a></p>
</form>`),
	);
});

more.post("/taste", async (c) => {
	const form = await c.req.formData();
	await ensureDefaultRules(c.env.DB);
	const rules = await getRules(c.env.DB, TASTE.map((t) => t.rule));
	for (const t of TASTE) {
		const current = rules.find((r) => r.name === t.rule);
		if (!current) continue;
		const values = Object.fromEntries(t.fields.map((f) => [f.heading, String(form.get(`${t.rule}|${f.heading}`) ?? "").slice(0, 4000)]));
		await saveRule(c.env.DB, t.rule, current.title, writeTaste(t, current.body, values)); // unchanged → no new version
	}
	await setSetting(c.env.DB, "taste_card", "done");
	return c.redirect("/taste?saved=1", 303);
});

more.post("/taste/later", async (c) => {
	await setSetting(c.env.DB, "taste_card", "later");
	return c.redirect("/", 303);
});

more.get("/rules", async (c) => {
	await ensureDefaultRules(c.env.DB);
	const rules = await getRules(c.env.DB);
	return c.html(
		layout(c, "more", "Rules", `
<p class="muted">The criteria your AI reads before every Book Hub answer. Edit one and your next request in any chat follows it. Every save keeps the old version.</p>
<ul class="cards">${rules
			.map((r) => `<li><a class="row" href="/rules/${encodeURIComponent(r.name)}"><span class="row-text"><strong>${esc(r.title)}</strong><span class="muted">${esc(r.name)} · v${r.version} · updated ${esc(r.updated_at.slice(0, 10))}</span></span></a></li>`)
			.join("")}</ul>`),
	);
});

more.get("/rules/:name", async (c) => {
	const name = c.req.param("name");
	await ensureDefaultRules(c.env.DB);
	const [rule] = await getRules(c.env.DB, [name]);
	if (!rule) return c.html(layout(c, "more", "Not found", `<p>No rule "${esc(name)}". <a href="/rules">Back</a></p>`), 404);
	const history = await getRuleHistory(c.env.DB, name);
	const editing = c.req.query("edit") === "1";
	return c.html(
		layout(c, "more", rule.title, `
<p><a href="/rules">← Rules</a></p>
<p class="muted">Version ${rule.version} · updated ${esc(rule.updated_at.slice(0, 16).replace("T", " "))} UTC</p>
${c.req.query("saved") ? `<p class="notice">Saved. Your next Book Hub request uses this version.</p>` : ""}
${editing
			? `<form method="post" action="/rules/${encodeURIComponent(name)}">
  <textarea name="body" class="editor" rows="24" spellcheck="true">${esc(rule.body)}</textarea>
  <div class="actions"><button class="btn">Save new version</button><a class="btn secondary" href="/rules/${encodeURIComponent(name)}">Cancel</a></div>
</form>`
			: `<div class="actions"><a class="btn" href="/rules/${encodeURIComponent(name)}?edit=1">Edit</a></div><article class="md">${renderMarkdown(rule.body)}</article>`}
<section class="panel">
  <h2>Previous versions</h2>
  ${history.length ? history
			.map((h) => `<details><summary>Version ${h.version} <span class="muted">· replaced ${esc(h.saved_at.slice(0, 10))}</span></summary><div class="pre">${esc(h.body)}</div>
  <form method="post" action="/rules/${encodeURIComponent(name)}/restore"><input type="hidden" name="version" value="${h.version}"><button class="btn secondary">Restore this version</button></form></details>`)
			.join("") : `<p class="muted">None yet.</p>`}
</section>`),
	);
});

more.post("/rules/:name", async (c) => {
	const name = c.req.param("name");
	const body = String((await c.req.formData()).get("body") ?? "").replace(/\r\n/g, "\n").trim();
	const [rule] = await getRules(c.env.DB, [name]);
	if (!rule || !body) return c.redirect(`/rules/${encodeURIComponent(name)}`, 303);
	await saveRule(c.env.DB, name, ruleTitle(body, rule.title), body + "\n");
	return c.redirect(`/rules/${encodeURIComponent(name)}?saved=1`, 303);
});

more.post("/rules/:name/restore", async (c) => {
	const name = c.req.param("name");
	const version = Number((await c.req.formData()).get("version"));
	const old = (await getRuleHistory(c.env.DB, name)).find((h) => h.version === version);
	const [rule] = await getRules(c.env.DB, [name]);
	if (old && rule) await saveRule(c.env.DB, name, ruleTitle(old.body, rule.title), old.body);
	return c.redirect(`/rules/${encodeURIComponent(name)}?saved=1`, 303);
});

more.get("/feedback", async (c) => {
	const items = await listFeedback(c.env.DB);
	const open = items.filter((f) => f.status === "open");
	const done = items.filter((f) => f.status === "resolved");
	const item = (f: (typeof items)[number]) => `<li><div class="pre">${esc(f.text)}</div>${f.context ? `<div class="muted">Context: ${esc(f.context)}</div>` : ""}
<div class="muted">#${f.id} · ${esc(f.created_at.slice(0, 10))}${f.resolution ? ` · Fix: ${esc(f.resolution)}` : ""}</div>
<form method="post" action="/feedback/${f.id}/${f.status === "open" ? "resolve" : "reopen"}" class="actions">${f.status === "open" ? `<input name="resolution" placeholder="What was done (optional)">` : ""}<button class="btn secondary">${f.status === "open" ? "Mark resolved" : "Reopen"}</button></form></li>`;
	return c.html(
		layout(c, "more", "Feedback", `
<p class="muted">Problems and change requests. Add them here or say “book hub feedback: …” in any Claude chat. Open items get fixed in Claude Code (“work on hub feedback”).</p>
<form method="post" action="/feedback" class="note-form"><textarea name="text" rows="2" placeholder="What's wrong or missing?" required></textarea><button class="btn">Add feedback</button></form>
<section class="panel"><h2>Open <span class="muted">(${open.length})</span></h2>${open.length ? `<ul class="plain">${open.map(item).join("")}</ul>` : `<p class="muted">Nothing open.</p>`}</section>
<section class="panel"><h2>Resolved <span class="muted">(${done.length})</span></h2>${done.length ? `<ul class="plain">${done.map(item).join("")}</ul>` : `<p class="muted">None yet.</p>`}</section>`),
	);
});

more.post("/feedback", async (c) => {
	const text = String((await c.req.formData()).get("text") ?? "").trim();
	if (text) await saveFeedback(c.env.DB, text.slice(0, 5000), "Added in the hub");
	return c.redirect("/feedback", 303);
});

more.post("/feedback/:id/:action{resolve|reopen}", async (c) => {
	const resolution = String((await c.req.formData()).get("resolution") ?? "").trim();
	await resolveFeedback(c.env.DB, Number(c.req.param("id")), resolution, c.req.param("action") === "reopen");
	return c.redirect("/feedback", 303);
});

more.get("/settings", async (c) => {
	const db = c.env.DB;
	const [runs, counts, currency] = await Promise.all([
		listTestRuns(db, 1),
		db
			.prepare(
				`SELECT (SELECT COUNT(*) FROM sources) AS sources, (SELECT COUNT(*) FROM notes) AS notes, (SELECT COUNT(*) FROM requests) AS requests,
				 (SELECT COUNT(*) FROM discussions) AS discussions, (SELECT COUNT(*) FROM summaries) AS summaries, (SELECT COUNT(*) FROM facts) AS facts`,
			)
			.first<Record<string, number>>(),
		getCurrency(db),
	]);
	const last = runs[0];
	return c.html(
		layout(c, "more", "Settings", `
<section class="panel" id="ai-app">
  <h2>AI app</h2>
  <form method="post" action="/settings/ai-app" class="stack">
    ${Object.entries(AI_APPS).map(([k, [label, sub]]) => `<label class="choice opt"><input type="radio" name="ai_app" value="${k}"${k === (c.get("aiApp") ?? "claude") ? " checked" : ""}> <span><strong>${esc(label)}</strong> <span class="muted">${esc(sub)}</span></span></label>`).join("")}
    <p><button class="btn secondary">Save</button></p>
  </form>
  <p class="muted">Which app the “Ask AI” buttons open. Your books, notes and rules live here, so any app connected to Book Hub sees the same library.</p>
</section>
<section class="panel" id="currency">
  <h2>Currency</h2>
  <form method="post" action="/settings/currency" class="inline-fields">
    <label>Prices in <select name="currency">${Object.entries(CURRENCIES).map(([code, cur]) => `<option value="${code}"${code === currency ? " selected" : ""}>${esc(cur.name)} (${esc(cur.symbol.trim())})</option>`).join("")}</select></label>
    <button class="btn secondary">Save</button>
  </form>
  <p class="muted">Your AI quotes and saves prices in this currency. Prices saved in another currency show converted with “≈”, using built-in approximate rates (${RATES_AS_OF}) — no live rate service, so nothing extra to pay or set up.</p>
</section>
<section class="panel">
  <h2>Export and backup</h2>
  <p class="muted">A full copy of your library as one Markdown file: a backup you can read anywhere, and a handy note for Obsidian or any other notes app. To save it to your computer automatically every week, see <code>scripts/backup-export.sh</code>.</p>
  <div class="actions"><a class="btn" href="/export.md">Download as Markdown</a><a class="btn secondary" href="/export.json">Download full backup (JSON)</a></div>
</section>
<section class="panel">
  <h2>Usage</h2>
  <p>${Object.entries(counts ?? {}).map(([k, v]) => `${v} ${esc(k)}`).join(" · ")}</p>
  <p class="muted">Cloudflare free plan: 100,000 requests and 5 million database row reads per day; going over pauses the hub until 05:30 IST and is never billed. Live numbers: Cloudflare dashboard → Workers &amp; Pages → book-hub → Metrics, and Storage &amp; Databases → D1 → book-hub.</p>
</section>
<section class="panel">
  <h2>Test results</h2>
  ${last ? `<p>Last run ${esc(last.created_at.slice(0, 16).replace("T", " "))} UTC: <strong>${esc(String(last.summary.passed ?? "?"))} passed</strong>, ${esc(String(last.summary.failed ?? "?"))} failed.</p><p><a href="/tests">See details →</a></p>` : `<p class="muted">No behaviour test runs uploaded yet.</p>`}
</section>
<section class="panel">
  <h2>Connection</h2>
  <p>Connector address for Claude: <code>${esc(new URL("/mcp", c.req.url).href)}</code></p>
  <p class="muted">If Claude can't see new tools: claude.ai → Settings → Connectors → Book Hub → Disconnect, then Connect, then start a new chat.</p>
  <p class="muted">Signed in as ${esc(c.get("login"))}. <a href="/logout">Sign out</a></p>
</section>`),
	);
});

more.post("/settings/ai-app", async (c) => {
	const v = (await c.req.formData()).get("ai_app");
	if (isAiApp(v)) await setSetting(c.env.DB, "ai_app", v);
	return c.redirect("/settings#ai-app", 303);
});

more.post("/settings/currency", async (c) => {
	const v = (await c.req.formData()).get("currency");
	if (isCurrency(v)) await setSetting(c.env.DB, "currency", v);
	return c.redirect("/settings#currency", 303);
});

more.get("/tests", async (c) => {
	const runs = await listTestRuns(c.env.DB, 10);
	return c.html(
		layout(c, "more", "Test results", `
<p><a href="/settings">← Settings</a></p>
<p class="muted">Behaviour tests: fixed requests run through Claude against a local copy of Book Hub, checked automatically. Uploaded after each run.</p>
${runs.length ? runs
			.map((r) => `<section class="panel"><h2>${esc(r.created_at.slice(0, 16).replace("T", " "))} UTC · ${esc(String(r.summary.passed ?? 0))} passed · ${esc(String(r.summary.failed ?? 0))} failed</h2>
${Array.isArray(r.summary.results) ? `<ul class="plain">${r.summary.results.map((t: any) => `<li>${t.pass ? "✅" : "❌"} ${esc(String(t.name ?? ""))}${t.reason ? `<div class="muted">${esc(String(t.reason)).slice(0, 500)}</div>` : ""}</li>`).join("")}</ul>` : ""}</section>`)
			.join("") : `<p class="empty">No runs yet.</p>`}`),
	);
});

more.get("/export.md", async (c) => {
	return new Response(await buildMarkdownExport(c.env.DB), {
		headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="Book Hub Library Export.md"` },
	});
});

more.get("/export.json", async (c) => {
	return new Response(JSON.stringify(await buildJsonExport(c.env.DB), null, 1), {
		headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="book-hub-backup-${new Date().toISOString().slice(0, 10)}.json"` },
	});
});

