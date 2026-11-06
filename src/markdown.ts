// Minimal, safe markdown → HTML for cards, summaries, discussions and rules.
// Everything is HTML-escaped first; only a known set of patterns becomes markup. Links must be http(s).

export function esc(s: string) {
	return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch]!);
}

function inline(text: string): string {
	return esc(text)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
		.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
		.replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, "$1<em>$2</em>");
}

export function renderMarkdown(md: string): string {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (/^```/.test(line)) {
			const code: string[] = [];
			i++;
			while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
			i++;
			out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
			continue;
		}
		const h = line.match(/^(#{1,4})\s+(.*)$/);
		if (h) {
			const level = Math.min(h[1].length + 1, 5); // page already has an h1
			out.push(`<h${level}>${inline(h[2])}</h${level}>`);
			i++;
			continue;
		}
		if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
			const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
			const head = cells(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
			out.push(
				`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows
					.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
					.join("")}</tbody></table></div>`,
			);
			continue;
		}
		if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
			const ordered = /^\s*\d+\./.test(line);
			const items: string[] = [];
			while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
				const indent = lines[i].match(/^\s*/)![0].length;
				const item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
				items.push(`<li${indent >= 2 ? ' class="sub"' : ""}>${inline(item)}</li>`);
				i++;
			}
			out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
			continue;
		}
		if (/^>\s?/.test(line)) {
			const quote: string[] = [];
			while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
			out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
			continue;
		}
		if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
			out.push("<hr>");
			i++;
			continue;
		}
		if (!line.trim()) {
			i++;
			continue;
		}
		const para: string[] = [];
		while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s+|\s*\|.*\|\s*$)/.test(lines[i])) para.push(lines[i++]);
		if (para.length === 0) para.push(lines[i++]); // e.g. a lone "|" line that isn't a table
		out.push(`<p>${para.map(inline).join("<br>")}</p>`);
	}
	return out.join("\n");
}
