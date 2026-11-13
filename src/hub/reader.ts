// The long-summary reading view: contents beside a wide reading column, text style and size, versions, PDF.

import { renderMarkdown } from "../markdown";
import { askButton, esc, tip } from "./ui";

/** Minutes to read at 200 words a minute, ignoring pictures (a base64 diagram is one "word" thousands of letters long). */
export function readMinutes(body: string) {
	const words = body.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
	return Math.max(1, Math.round(words / 200));
}

type Section = { id: string; title: string; html: string };

/**
 * Splits a rendered summary into its sections. In the markdown, "# Title" is the summary's own title (the page shows
 * the book instead), "## Heading" starts a section and "### Heading" a sub-heading. Numbers like "3. " are dropped
 * from section titles, and an italic "Figure…" line right after a picture becomes its caption.
 */
export function splitSummary(body: string): { intro: string; sections: Section[] } {
	let html = renderMarkdown(body)
		.replace(/^\s*<h2>[\s\S]*?<\/h2>\s*/, "")
		.replace(/<\/figure>\s*<p><em>((?:Figure|Fig\.|Diagram|Picture|Image|Photo)[\s\S]*?)<\/em><\/p>/g, "<figcaption>$1</figcaption></figure>")
		.replace(/<h4>/g, "<h3>")
		.replace(/<\/h4>/g, "</h3>");
	const parts = html.split(/(?=<h3>)/);
	const sections: Section[] = [];
	let intro = "";
	// Only top-level "## " headings start sections: they were rendered as <h3> before the <h4> → <h3> swap above,
	// so find them in the original markdown order instead.
	const top = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
	let n = 0;
	for (const part of parts) {
		const m = part.match(/^<h3>([\s\S]*?)<\/h3>/);
		const plain = m ? m[1].replace(/<[^>]+>/g, "") : "";
		const isTop = m && n < top.length && plain === renderMarkdown(`## ${top[n]}`).replace(/<[^>]+>/g, "");
		if (!isTop) {
			if (sections.length) sections[sections.length - 1].html += part;
			else intro += part;
			continue;
		}
		n++;
		const title = m![1].replace(/^\d+[.)]\s*/, "");
		sections.push({ id: `s${n}`, title, html: part.replace(/^<h3>[\s\S]*?<\/h3>/, `<h2 id="s${n}">${title}</h2>`) });
	}
	return { intro, sections };
}

export type Version = { id: number; created_at: string };

export function summaryReader(o: { id: number; sourceId: number; book: string; byline: string; body: string; versions: Version[] }) {
	const { intro, sections } = splitSummary(o.body);
	const minutes = readMinutes(o.body);
	const total = o.versions.length;
	const index = o.versions.findIndex((v) => v.id === o.id);
	const number = index >= 0 ? total - index : 1;
	const created = o.versions[index]?.created_at ?? "";
	const toc = sections.map((s) => `<li><a href="#${s.id}" data-sec="${s.id}">${s.title.replace(/<[^>]+>/g, "")}</a></li>`).join("");
	const picker =
		total > 1
			? `<select class="btn secondary version-pick" aria-label="Version" onchange="location.href='/summary/'+this.value">${o.versions
					.map((v, i) => `<option value="${v.id}"${v.id === o.id ? " selected" : ""}>Version ${total - i} · ${esc(v.created_at.slice(0, 10))}${i === 0 ? " (latest)" : ""}</option>`)
					.join("")}</select>`
			: "";
	const body = sections
		.map((s) => `<section data-sec="${s.id}"${/^can this summary replace/i.test(s.title.replace(/<[^>]+>/g, "")) ? ` class="replace"` : ""}>${s.html}</section>`)
		.join("\n");
	return `<div class="reading" data-minutes="${minutes}">
<aside class="rail" aria-label="Contents"><h4>Contents</h4><ol id="toc">${toc}</ol><p class="left" id="left">${minutes} min left</p></aside>
<article class="reader">
<div class="phonebar"><button type="button" id="open-toc" aria-haspopup="dialog">Contents</button><span class="now" id="now">${sections[0] ? sections[0].title.replace(/<[^>]+>/g, "") : ""}</span><span id="left-phone">${minutes} min</span></div>
<a class="back" href="/book/${o.sourceId}">← ${esc(o.book)}</a>
<p class="eyebrow">Long summary</p>
<h1>${esc(o.book)}</h1>
${o.byline ? `<p class="byline">${esc(o.byline)}</p>` : ""}
<div class="meta"><span>${minutes} min read</span><span class="sep">·</span><span>${total > 1 ? `Version ${number} of ${total}, ` : ""}saved ${esc(created.slice(0, 10))}</span></div>
<div class="tools">${picker}<button class="btn secondary" type="button" id="pdf"${tip("pdf")}>Download PDF</button>${askButton("Improve in Claude", `/book-summary Improve my summary of ${o.book} (summary #${o.id}).`, "btn secondary", "improveSummary")}
<span class="seg" role="group" aria-label="Text style"><button type="button" class="bookface" data-font="book">Book</button><button type="button" data-font="clean">Clean</button></span>
<span class="seg" role="group" aria-label="Text size"><button type="button" data-size="small" aria-label="Smaller text">A−</button><button type="button" data-size="" aria-label="Normal text">A</button><button type="button" data-size="large" aria-label="Larger text">A+</button></span></div>
${intro ? `<div class="intro">${intro}</div>` : ""}
${body}
</article></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-label="Contents" hidden><div class="sheet-panel"><h4>Contents</h4><ol>${toc}</ol></div></div>
<script>${READER_JS}</script>`;
}

export const READER_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap">
<style>${`
body{--book:"Literata",Georgia,"Times New Roman",serif;--ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--read:var(--book);--read-size:1.125rem;--tint:#f7f6f3}
body.clean{--read:var(--ui);--read-size:1.09rem}body.small{--read-size:1rem}body.clean.small{--read-size:.98rem}body.large{--read-size:1.25rem}body.clean.large{--read-size:1.2rem}
html{scroll-behavior:smooth;scroll-padding-top:110px}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
.read-progress{position:fixed;left:0;top:0;height:3px;background:var(--ink);width:0;z-index:10}
.reading{display:grid;grid-template-columns:230px minmax(0,1fr);gap:56px;padding-top:16px}
.rail{position:sticky;top:84px;align-self:start;max-height:calc(100vh - 110px);overflow:auto;font-size:.9rem}
.rail h4,.sheet h4{margin:0 0 8px;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.rail ol{list-style:none;margin:0 0 20px;padding:0;border-left:1px solid var(--line)}
.rail li a{display:block;padding:5px 0 5px 12px;margin-left:-1px;border-left:2px solid transparent;color:var(--muted);text-decoration:none;line-height:1.35}
.rail li a.on{color:var(--ink);border-left-color:var(--ink);font-weight:600}.rail .left{color:var(--muted);font-size:.82rem}
.reader{max-width:52rem;font-family:var(--read);font-size:var(--read-size);line-height:1.7;overflow-wrap:break-word}
.reader .back{font:500 .9rem var(--ui);display:inline-block;margin-bottom:18px}
.eyebrow{font:600 .75rem var(--ui);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
.reader h1{font-family:var(--read);font-weight:600;font-size:2.2em;line-height:1.15;margin:0 0 8px;text-wrap:balance;letter-spacing:-.01em}
.byline{font-style:italic;color:var(--muted);margin:0 0 18px}
.meta{display:flex;flex-wrap:wrap;gap:8px 10px;font:14px/1.4 var(--ui);color:var(--muted);padding-bottom:18px;border-bottom:1px solid var(--line)}.meta .sep{color:var(--edge)}
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:16px 0 8px;font-family:var(--ui)}.tools .btn{display:inline-flex;align-items:center;min-height:36px;padding:6px 13px;font-size:.9rem;line-height:1.2}
select.version-pick{appearance:none;padding-right:28px;background-image:linear-gradient(45deg,transparent 50%,var(--ink) 50%),linear-gradient(135deg,var(--ink) 50%,transparent 50%);background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px;background-repeat:no-repeat}
.seg{display:inline-flex;border:1px solid var(--edge);border-radius:6px;overflow:hidden}
.seg button{border:0;background:#fff;font:600 .85rem var(--ui);padding:7px 11px;cursor:pointer;color:var(--muted)}.seg button+button{border-left:1px solid var(--edge)}
.seg button[aria-pressed="true"]{background:var(--ink);color:#fff}.seg .bookface{font-family:var(--book)}
.reader .intro{color:var(--muted);font-style:italic;margin-top:18px}
.reader h2{font-family:var(--read);font-weight:600;font-size:1.45em;line-height:1.25;margin:2.2em 0 .6em;text-wrap:balance}
.reader h3{font-family:var(--ui);font-weight:700;font-size:.95em;margin:1.8em 0 .4em}
.reader p{margin:0 0 1em}.reader ul,.reader ol{padding-left:1.25em;margin:0 0 1.1em}.reader li{margin:.35em 0}
.reader blockquote{margin:1.4em 0;padding:.2em 0 .2em 1.1em;border-left:3px solid var(--ink);font-style:italic;color:var(--ink)}
.reader figure{margin:1.8em 0;text-align:left}.reader figure img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid var(--line);background:#fff}
.reader figcaption{font:italic .86rem/1.5 var(--ui);color:var(--muted);margin-top:.6em}
.reader hr{display:none}.reader table{font:.9rem/1.45 var(--ui)}
.reader section.replace{margin:22px 0 8px;padding:4px 18px 6px;border:1px solid var(--line);border-radius:12px;background:var(--tint);font:15px/1.55 var(--ui)}
.reader section.replace h2{font:700 1rem var(--ui);margin:14px 0 8px}
.phonebar{display:none}
.sheet{position:fixed;inset:0;z-index:20;background:rgba(23,24,27,.35);display:flex;align-items:flex-end}
.sheet-panel{background:#fff;width:100%;max-height:75vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px 18px calc(18px + env(safe-area-inset-bottom,0px))}
.sheet ol{list-style:none;padding:0;margin:0}.sheet li a{display:block;padding:11px 2px;border-bottom:1px solid var(--line);text-decoration:none}.sheet li a.on{font-weight:700}
@media (max-width:860px){.reading{grid-template-columns:1fr;gap:0;padding-top:0}.rail{display:none}
.phonebar{display:flex;position:sticky;top:57px;z-index:4;background:#fff;border-bottom:1px solid var(--line);margin:0 -16px 12px;padding:8px 16px;align-items:center;gap:10px;font:14px var(--ui)}
.phonebar button{border:1px solid var(--edge);background:#fff;border-radius:6px;padding:5px 10px;font:600 .85rem var(--ui);color:var(--ink)}
.phonebar .now{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}.reader h1{font-size:1.8em}}
@media print{.top,.tabs,.rail,.phonebar,.tools,.back,.read-progress,nav{display:none!important}main{padding:0;max-width:none}.reading{display:block}.reader{max-width:none;font-size:11pt}.reader figure{break-inside:avoid}}
`}</style>`;

// Text style and size are remembered on this device; everything works without storage too.
const READER_JS = `(function(){
var b=document.body,$=function(i){return document.getElementById(i)},root=document.querySelector('.reading');if(!root)return;
var bar=document.createElement('div');bar.className='read-progress';b.appendChild(bar);
var total=+root.dataset.minutes||1,secs=[].slice.call(document.querySelectorAll('section[data-sec]'));
function get(k){try{return localStorage.getItem(k)}catch(e){return null}}function put(k,v){try{localStorage.setItem(k,v)}catch(e){}}
var fonts=[].slice.call(document.querySelectorAll('[data-font]')),sizes=[].slice.call(document.querySelectorAll('[data-size]'));
function setFont(f){b.classList.toggle('clean',f==='clean');fonts.forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.font===(f||'book')))})}
function setSize(s){b.classList.remove('small','large');if(s)b.classList.add(s);sizes.forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.size===(s||'')))})}
setFont(get('bh-font'));setSize(get('bh-size'));
fonts.forEach(function(x){x.onclick=function(){setFont(x.dataset.font);put('bh-font',x.dataset.font)}});
sizes.forEach(function(x){x.onclick=function(){setSize(x.dataset.size);put('bh-size',x.dataset.size)}});
$('pdf').onclick=function(){window.print()};
$('open-toc').onclick=function(){$('sheet').hidden=false};
$('sheet').onclick=function(e){if(e.target.id==='sheet'||e.target.tagName==='A')$('sheet').hidden=true};
var links=[].slice.call(document.querySelectorAll('a[data-sec]'));
function update(){var h=document.documentElement,max=h.scrollHeight-h.clientHeight,f=max>0?Math.min(1,h.scrollTop/max):0;
bar.style.width=(f*100)+'%';var left=Math.max(1,Math.round(total*(1-f)));$('left').textContent=left+' min left';$('left-phone').textContent=left+' min';
if(!secs.length)return;var cur=secs[0];secs.forEach(function(s){if(s.getBoundingClientRect().top<140)cur=s});
links.forEach(function(a){a.classList.toggle('on',a.dataset.sec===cur.dataset.sec)});var l=links.filter(function(a){return a.dataset.sec===cur.dataset.sec})[0];if(l)$('now').textContent=l.textContent}
addEventListener('scroll',update,{passive:true});addEventListener('resize',update);update();
})();`;
