// Profile & settings: about me, how books are judged, settings, system rules; plus feedback, settings and exports.

import { Hono } from "hono";
import { getCurrency, getRuleHistory, getRules, listFeedback, listTestRuns, resolveFeedback, saveFeedback, saveRule, setSetting, type Rule } from "../db";
import { CURRENCIES, isCurrency, RATES_AS_OF } from "../currency";
import { buildJsonExport, buildMarkdownExport } from "../export";
import { renderMarkdown } from "../markdown";
import {
	nonfictionProgress,
	ORIGINALS_OPTIONS,
	readNonfiction,
	readQuality,
	readSimple,
	SIMPLE_FORMS,
	SUBJECT_OPTIONS,
	TIME_OPTIONS,
	WHY_OPTIONS,
	writeNonfiction,
	writeQuality,
	writeSimple,
} from "../profile";
import { DEFAULT_RULES, ensureDefaultRules, isStarter, RULE_GROUPS, RULE_INFO, ruleInfo, ruleTitle, type RuleGroup } from "../rules-defaults";
import { COMMANDS } from "./lists";
import { AI_APPS, esc, isAiApp, layout, type HubEnv } from "./ui";

export const more = new Hono<HubEnv>();
// ---- Rules: grouping and state ---------------------------------------------------------------------------

const ORDER = Object.keys(RULE_INFO);
const byOrder = (a: Rule, b: Rule) => (ORDER.indexOf(a.name) + 1 || 999) - (ORDER.indexOf(b.name) + 1 || 999) || a.name.localeCompare(b.name);

/** The short state next to a rule: how much is filled in, or whether it's still the starter. */
function ruleState(r: Rule): [string, string] {
	if (r.name === "nonfiction-profile") {
		const p = nonfictionProgress(r.body);
		return p.filled ? [`${p.filled} of ${p.total} filled`, p.filled === p.total ? "ok" : ""] : ["Not set", ""];
	}
	if (r.name === "trusted-readers") {
		const n = (readSimple(SIMPLE_FORMS[r.name], r.body)["People whose picks I trust"] ?? "").split(/\s+·\s+|\n/).filter((x) => x.trim()).length;
		return isStarter(r.name, r.body) ? ["Starter list", ""] : n ? [`${n} ${n === 1 ? "person" : "people"}`, ""] : ["Not set", ""];
	}
	if (SIMPLE_FORMS[r.name]) return !isStarter(r.name, r.body) && Object.values(readSimple(SIMPLE_FORMS[r.name], r.body)).some(Boolean) ? ["Filled", "ok"] : ["Not set", ""];
	if (!(r.name in DEFAULT_RULES)) return ["Your rule", "buy"];
	return isStarter(r.name, r.body) ? ["Using starter", ""] : ["Customised", "buy"];
}

function ruleItem(r: Rule) {
	const info = ruleInfo(r.name, r.title);
	const [state, cls] = ruleState(r);
	return `<li><a class="item" href="/rules/${encodeURIComponent(r.name)}"><span class="what"><strong>${esc(info.label)}</strong><span class="muted">${esc(info.what)}</span></span><span class="tag ${cls}">${esc(state)}</span><span class="chev" aria-hidden="true">›</span></a></li>`;
}

function group(g: RuleGroup, rules: Rule[], badge = "") {
	const list = rules.filter((r) => ruleInfo(r.name, r.title).group === g).sort(byOrder);
	return `<section class="group${g === "system" ? " danger" : ""}" id="${g}"><h2>${esc(RULE_GROUPS[g].title)} ${badge}</h2><p class="muted">${esc(RULE_GROUPS[g].intro)}</p><ul class="items">${list.map(ruleItem).join("")}</ul></section>`;
}

const settingItem = (href: string, label: string, sub: string, tag = "") =>
	`<li><a class="item" href="${href}"><span class="what"><strong>${esc(label)}</strong><span class="muted">${esc(sub)}</span></span>${tag}<span class="chev" aria-hidden="true">›</span></a></li>`;

more.get("/more", async (c) => {
	await ensureDefaultRules(c.env.DB);
	const [rules, currency] = await Promise.all([getRules(c.env.DB), getCurrency(c.env.DB)]);
	const systemCount = rules.filter((r) => ruleInfo(r.name).group === "system").length;
	return c.html(
		layout(c, "more", "Profile & settings", `
<p class="muted">Signed in as <strong>${esc(c.get("login"))}</strong> (GitHub)</p>
${group("me", rules, `<span class="tag ok">Guided</span>`)}
${group("judge", rules, `<span class="tag">Optional</span>`)}
<section class="group" id="settings"><h2>Settings</h2><ul class="items">
${settingItem("/settings#ai-app", "AI app", AI_APPS[(c.get("aiApp") ?? "claude") as keyof typeof AI_APPS]?.[0] ?? "Claude")}
${settingItem("/settings#currency", "Currency", `${CURRENCIES[currency].name} (${CURRENCIES[currency].symbol.trim()})`)}
${settingItem("/settings#connection", "Connection", "Your connector address for AI apps")}
${settingItem("/settings#export", "Export and backup", "Markdown or full backup")}
${settingItem("/add", "Add a book", "Find it on Open Library and add it to your shelf or Buy list")}
${settingItem("/requests", "All requests", "Everything you've asked your AI")}
${settingItem("/feedback", "Feedback", "Problems and ideas you've sent")}
<li><div class="item"><span class="what"><strong>Kindle</strong><span class="muted">Your Kindle library and highlights</span></span><span class="tag star">Coming soon</span></div></li>
</ul></section>
<section class="group danger" id="system-link"><h2>System rules</h2><p class="muted">${esc(RULE_GROUPS.system.intro)}</p>
<ul class="items">${settingItem("/rules#system", "Open system rules", `${systemCount} rules`)}</ul></section>
<details class="panel"><summary><strong>Commands for Claude</strong></summary><div class="table-wrap"><table class="commands"><tbody>${COMMANDS.map(([cmd, what]) => `<tr><td>${cmd}</td><td>${esc(what)}</td></tr>`).join("")}</tbody></table></div></details>
<p><a class="btn secondary" href="/logout">Sign out</a></p>`),
	);
});

// Old address of the taste form.
more.get("/taste", (c) => c.redirect("/rules/nonfiction-profile", 302));

more.post("/setup/hide", async (c) => {
	await setSetting(c.env.DB, "setup_card", "hidden");
	return c.redirect("/", 303);
});

more.get("/rules", async (c) => {
	await ensureDefaultRules(c.env.DB);
	const rules = await getRules(c.env.DB);
	return c.html(
		layout(c, "more", "Rules", `
<p class="muted">Everything your AI reads before a Book Hub answer, in plain words. Change one and your next request in any chat follows it. Every save keeps the old version.</p>
${group("me", rules)}${group("judge", rules)}${group("system", rules)}`),
	);
});

// ---- One rule: in plain words / rule text / history -----------------------------------------------------------

const VIEWS = { plain: "In plain words", text: "Rule text", history: "History" } as const;
type View = keyof typeof VIEWS;

more.get("/rules/:name", async (c) => {
	const name = c.req.param("name");
	await ensureDefaultRules(c.env.DB);
	const [rule] = await getRules(c.env.DB, [name]);
	if (!rule) return c.html(layout(c, "more", "Not found", `<p>No rule "${esc(name)}". <a href="/rules">Back</a></p>`), 404);
	const info = ruleInfo(name, rule.title);
	const view: View = (Object.keys(VIEWS) as View[]).find((v) => v === c.req.query("view")) ?? (c.req.query("edit") === "1" ? "text" : "plain");
	const enc = encodeURIComponent(name);
	const [state, cls] = ruleState(rule);
	const tabs = `<nav class="seg" aria-label="View">${(Object.keys(VIEWS) as View[]).map((v) => `<a href="/rules/${enc}?view=${v}"${v === view ? ` aria-current="page"` : ""}>${VIEWS[v]}</a>`).join("")}</nav>`;
	let content = "";
	if (view === "plain") content = await plainView(c.env.DB, rule);
	else if (view === "text") {
		content = c.req.query("edit") === "1"
			? `<form method="post" action="/rules/${enc}"><p class="muted">Exactly what your AI reads. Markdown: "## " starts a section, "- " a list item.</p><textarea name="body" class="editor" rows="26" spellcheck="true">${esc(rule.body)}</textarea>
  <div class="actions"><button class="btn">Save new version</button><a class="btn secondary" href="/rules/${enc}?view=text">Cancel</a></div></form>`
			: `<p class="muted">Exactly what your AI reads. Version ${rule.version} · updated ${esc(rule.updated_at.slice(0, 16).replace("T", " "))} UTC.</p><div class="actions"><a class="btn" href="/rules/${enc}?view=text&edit=1">Edit rule text</a></div><article class="md">${renderMarkdown(rule.body)}</article>`;
	} else {
		const history = await getRuleHistory(c.env.DB, name);
		content = `<p class="muted">Version ${rule.version} is current (updated ${esc(rule.updated_at.slice(0, 10))}). Earlier versions:</p>
${history.length ? history
			.map((h) => `<details><summary>Version ${h.version} <span class="muted">· replaced ${esc(h.saved_at.slice(0, 10))}</span></summary><div class="pre">${esc(h.body)}</div>
<form method="post" action="/rules/${enc}/restore"><input type="hidden" name="version" value="${h.version}"><button class="btn secondary">Restore this version</button></form></details>`)
			.join("") : `<p class="muted">None yet.</p>`}
${name in DEFAULT_RULES && !isStarter(name, rule.body) ? `<form method="post" action="/rules/${enc}/reset" class="actions"><button class="btn secondary">Reset to starter</button><span class="muted">Saved as a new version; nothing is lost.</span></form>` : ""}`;
	}
	return c.html(
		layout(c, "more", info.label, `
<p class="crumbs"><a href="/more">Profile &amp; settings</a> › <a href="/rules#${info.group}">${esc(RULE_GROUPS[info.group].title)}</a></p>
<div class="rule-head"><span class="tag ${cls}">${esc(state)}</span></div>
<p class="used"><strong>Used in:</strong> ${esc(info.usedIn)}</p>
${info.group === "system" ? `<p class="warn">A system rule: it keeps answers honest and the hub consistent. Changes affect every answer. Every version is kept and can be restored.</p>` : ""}
${c.req.query("saved") ? `<p class="notice">Saved. Your next Book Hub request uses it.</p>` : ""}
${tabs}
${content}`),
	);
});

async function plainView(db: D1Database, rule: Rule) {
	const name = rule.name;
	const info = ruleInfo(name, rule.title);
	const enc = encodeURIComponent(name);
	if (name === "nonfiction-profile") return nonfictionForm(rule.body);
	if (SIMPLE_FORMS[name]) {
		const values = readSimple(SIMPLE_FORMS[name], rule.body);
		return `<p>${esc(info.what)}</p><form method="post" action="/rules/${enc}/form" class="stack review-form">
${SIMPLE_FORMS[name].fields.map((f) => `<label class="field">${esc(f.label)}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}<textarea name="${esc(f.heading)}" rows="${f.rows}" placeholder="${esc(f.placeholder)}">${esc(values[f.heading].replace(/\*\*/g, ""))}</textarea></label>`).join("")}
<div class="actions"><button class="btn">Save</button><a class="btn secondary" href="/more">Cancel</a></div></form>`;
	}
	if (name.startsWith("quality-")) {
		const q = readQuality(rule.body);
		if (q.weights.length) {
			return `<p>${esc(info.what)} It's about the book only, never about you. Shown out of 10 with a tier: Core 8.5+ · Strong 7.5+ · Good 6.5+ · Edge.</p>
<form method="post" action="/rules/${enc}/form">
${q.gates.length ? `<div class="section-title"><h2>Gates</h2><span class="muted">a book that fails one is never recommended</span></div>
<ul class="plain">${q.gates.map((g) => `<li><label class="choice opt"><input type="checkbox" name="gate" value="${esc(g.name)}"${g.on ? " checked" : ""}> <span><strong>${esc(g.name)}</strong> <span class="muted">${esc(g.text)}</span></span></label></li>`).join("")}</ul>` : ""}
<div class="section-title"><h2>Factors and weights</h2><span class="muted">each factor is scored 1 to 5</span></div>
<div class="weights">${q.weights.map((w, i) => `<label class="name" for="w${i}">${esc(w.name)}</label><span class="muted">${esc(w.question)}</span><input type="number" id="w${i}" name="weight:${esc(w.name)}" min="0" max="9" value="${w.weight}">`).join("")}</div>
<p class="hint">Higher weight = matters more to you. The factor scores themselves are about the book and the same for everyone.</p>
<div class="actions"><button class="btn">Save</button></div></form>
<details><summary><strong>Everything else in this rule</strong> <span class="muted">(Timeless, caps, examples)</span></summary><article class="md">${renderMarkdown(rule.body)}</article></details>`;
		}
	}
	let extra = "";
	if (name === "verdict") {
		const [profile, buying] = await getRules(db, ["nonfiction-profile", "buying-preferences"]).then((rs) => [rs.find((r) => r.name === "nonfiction-profile"), rs.find((r) => r.name === "buying-preferences")]);
		const time = profile ? readNonfiction(profile.body).time : "";
		const buy = buying ? readSimple(SIMPLE_FORMS["buying-preferences"], buying.body)["My preferences"] : "";
		extra = `<section class="panel"><h2>Uses your settings</h2><dl class="facts"><dt>Reading time</dt><dd>${esc(time || "Not set")} · <a href="/rules/nonfiction-profile">change</a></dd><dt>Buying</dt><dd>${esc((buy || "Not set").replace(/\*\*/g, "").replace(/^- /gm, ""))} · <a href="/rules/buying-preferences">change</a></dd></dl></section>`;
	}
	return `<p>${esc(info.what)}</p>${extra}<article class="md">${renderMarkdown(rule.body)}</article><p class="muted">To change it, use <a href="/rules/${enc}?view=text&edit=1">Rule text</a>.</p>`;
}

function nonfictionForm(body: string) {
	const p = readNonfiction(body);
	const filled = (on: unknown) => (on ? `<span class="tag ok">Filled</span>` : `<span class="tag">Not set</span>`);
	const whyAll = [...p.why, ...WHY_OPTIONS.filter((o) => !p.why.some((w) => w.toLowerCase().replace(/\.$/, "") === o.toLowerCase()))];
	const subjectsAll = [...new Set([...p.subjectsIn, ...p.subjectsOut, ...SUBJECT_OPTIONS])];
	const state = (s: string) => (p.subjectsIn.includes(s) ? "in" : p.subjectsOut.includes(s) ? "out" : "");
	const option = (v: string, current: string) => `<option${v === current ? " selected" : ""}>${esc(v)}</option>`;
	const timeOptions = [...TIME_OPTIONS, ...(p.time && !TIME_OPTIONS.includes(p.time) ? [p.time] : [])];
	const origOptions = [...ORIGINALS_OPTIONS, ...(p.originalsPref && !ORIGINALS_OPTIONS.includes(p.originalsPref) ? [p.originalsPref] : [])];
	const box = (field: string, value: string, rows: number, placeholder: string) => `<textarea name="${field}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
	return `<p class="muted">Fill what you like, skip the rest. Empty sections are ignored, and Fit is then judged from your question and your library.</p>
<form method="post" action="/rules/nonfiction-profile/form" class="profile-form">
<div class="section-title"><h2>1. Why I read non-fiction</h2>${filled(p.why.length)}</div>
<p class="hint">Pick what applies, most important first. Add your own.</p>
<div class="chips">${whyAll.map((w) => `<label class="chip"><input type="checkbox" name="why" value="${esc(w)}"${p.why.includes(w) ? " checked" : ""}><span>${esc(w)}</span></label>`).join("")}</div>
<input name="why_add" placeholder="+ Add a reason" aria-label="Add a reason" class="add-input">

<div class="section-title"><h2>2. Subjects</h2>${filled(p.subjectsIn.length + p.subjectsOut.length)}</div>
<p class="hint">Tap once for "in", twice for "out", three times to clear.</p>
<div class="chips">${subjectsAll.map((sub) => `<button type="button" class="chip tri" data-state="${state(sub)}" aria-label="${esc(sub)}">${esc(sub)}</button><input type="hidden" name="subject:${esc(sub)}" value="${state(sub)}">`).join("")}</div>
<input name="subjects_add" placeholder="+ Add subjects you're into (comma-separated)" aria-label="Add subjects" class="add-input">

<div class="section-title"><h2>3. What I'm working on</h2>${filled(p.working)}</div>
<p class="hint">Weak spots and goals, one per line. A book that is the main book for one of these gets the highest Fit.</p>
${box("working", p.working, 5, "e.g. Speak up in meetings\nCalm a busy mind\nDecide faster on small things")}

<div class="section-title"><h2>4. Values</h2>${filled(p.values)}</div>
<p class="hint">Values you hold and ones you want to grow. Used to pick biographies.</p>
${box("values", p.values, 3, "e.g. Hold: honesty, curiosity · Grow: patience, courage")}

<div class="section-title"><h2>5. What makes a book worth it to me</h2>${filled(p.worth)}</div>
${box("worth", p.worth, 3, "e.g. Dense, no padding · Evidence where the field needs it · Ideas I'll keep using")}

<div class="section-title"><h2>6. Deal-breakers</h2>${filled(p.breakers)}</div>
${box("breakers", p.breakers, 2, "e.g. One idea stretched over a whole book")}

<div class="section-title"><h2>7. Originals or modern books</h2>${filled(p.originalsPref || p.originalsText)}</div>
<select name="originals_pref" aria-label="Originals or modern books"><option value="">Not set</option>${origOptions.map((o) => option(o, p.originalsPref)).join("")}</select>
<p class="hint">Preferred translations and anything else (optional)</p>
${box("originals_text", p.originalsText, 2, "e.g. The Odyssey: Emily Wilson's translation")}

<div class="section-title"><h2>8. Time for reading</h2>${filled(p.time)}</div>
<p class="hint">Helps decide between the whole book, some chapters, or a summary.</p>
<select name="time" aria-label="Time for reading"><option value="">Not set</option>${timeOptions.map((o) => option(o, p.time)).join("")}</select>

<div class="actions"><button class="btn">Save</button><a class="btn secondary" href="/more">Cancel</a></div>
</form>
<script>
document.querySelectorAll(".chip.tri").forEach((b) => {
  const input = b.nextElementSibling;
  const show = () => { b.dataset.state = input.value; b.setAttribute("aria-pressed", input.value ? "true" : "false"); b.title = input.value === "in" ? "In" : input.value === "out" ? "Out" : "Not set"; };
  show();
  b.addEventListener("click", () => { input.value = input.value === "" ? "in" : input.value === "in" ? "out" : ""; show(); });
});
</script>`;
}

const list = (v: unknown) => String(v ?? "").split(/,|\n/).map((x) => x.trim()).filter(Boolean);
const field = (form: FormData, k: string, max = 8000) => String(form.get(k) ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

more.post("/rules/:name/form", async (c) => {
	const name = c.req.param("name");
	const db = c.env.DB;
	await ensureDefaultRules(db);
	const [rule] = await getRules(db, [name]);
	if (!rule) return c.redirect("/more", 303);
	const form = await c.req.formData();
	let body = rule.body;
	if (name === "nonfiction-profile") {
		const subjectsIn: string[] = [];
		const subjectsOut: string[] = [];
		for (const [k, v] of form.entries()) {
			if (!k.startsWith("subject:")) continue;
			if (v === "in") subjectsIn.push(k.slice(8));
			if (v === "out") subjectsOut.push(k.slice(8));
		}
		for (const s of list(form.get("subjects_add"))) if (!subjectsIn.includes(s)) subjectsIn.push(s.slice(0, 60));
		const why = [...form.getAll("why").map(String), ...list(form.get("why_add")).map((w) => w.slice(0, 120))];
		body = writeNonfiction(body, {
			why: [...new Set(why)].slice(0, 12),
			subjectsIn: subjectsIn.slice(0, 40),
			subjectsOut: subjectsOut.slice(0, 40),
			working: field(form, "working"),
			values: field(form, "values"),
			worth: field(form, "worth"),
			breakers: field(form, "breakers"),
			originalsPref: field(form, "originals_pref", 200),
			originalsText: field(form, "originals_text"),
			time: field(form, "time", 100),
		});
	} else if (SIMPLE_FORMS[name]) {
		body = writeSimple(SIMPLE_FORMS[name], body, Object.fromEntries(SIMPLE_FORMS[name].fields.map((f) => [f.heading, field(form, f.heading, 4000)])));
	} else if (name.startsWith("quality-")) {
		const weights: Record<string, number> = {};
		for (const [k, v] of form.entries()) if (k.startsWith("weight:") && v !== "" && Number.isFinite(Number(v))) weights[k.slice(7)] = Number(v);
		body = writeQuality(body, new Set(form.getAll("gate").map(String)), weights);
	} else return c.redirect(`/rules/${encodeURIComponent(name)}`, 303);
	await saveRule(db, name, ruleTitle(body, rule.title), body); // unchanged → no new version
	if (name === "nonfiction-profile" || name === "fiction-profile") await setSetting(db, "profile_saved", "1");
	return c.redirect(`/rules/${encodeURIComponent(name)}?saved=1`, 303);
});

more.post("/rules/:name/reset", async (c) => {
	const name = c.req.param("name");
	const [rule] = await getRules(c.env.DB, [name]);
	const starter = DEFAULT_RULES[name];
	if (rule && starter) await saveRule(c.env.DB, name, ruleTitle(starter, rule.title), starter);
	return c.redirect(`/rules/${encodeURIComponent(name)}?saved=1`, 303);
});

more.post("/rules/:name", async (c) => {
	const name = c.req.param("name");
	const body = String((await c.req.formData()).get("body") ?? "").replace(/\r\n/g, "\n").trim();
	const [rule] = await getRules(c.env.DB, [name]);
	if (!rule || !body) return c.redirect(`/rules/${encodeURIComponent(name)}`, 303);
	await saveRule(c.env.DB, name, ruleTitle(body, rule.title), body + "\n");
	return c.redirect(`/rules/${encodeURIComponent(name)}?view=text&saved=1`, 303);
});

more.post("/rules/:name/restore", async (c) => {
	const name = c.req.param("name");
	const version = Number((await c.req.formData()).get("version"));
	const old = (await getRuleHistory(c.env.DB, name)).find((h) => h.version === version);
	const [rule] = await getRules(c.env.DB, [name]);
	if (old && rule) await saveRule(c.env.DB, name, ruleTitle(old.body, rule.title), old.body);
	return c.redirect(`/rules/${encodeURIComponent(name)}?view=history&saved=1`, 303);
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
<section class="panel" id="export">
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
<section class="panel" id="connection">
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

