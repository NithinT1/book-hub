// Currencies and approximate exchange rates. Built in on purpose: no live rate service, no cost, nothing to fail.
// Rates are rough (units per 1 US dollar) and refreshed with releases — converted prices always show "≈".

export const RATES_AS_OF = "Nov 2026";

export const CURRENCIES = {
	USD: { symbol: "$", name: "US dollar", perUSD: 1 },
	EUR: { symbol: "€", name: "Euro", perUSD: 0.86 },
	GBP: { symbol: "£", name: "British pound", perUSD: 0.76 },
	INR: { symbol: "₹", name: "Indian rupee", perUSD: 88 },
	CAD: { symbol: "C$", name: "Canadian dollar", perUSD: 1.4 },
	AUD: { symbol: "A$", name: "Australian dollar", perUSD: 1.53 },
	NZD: { symbol: "NZ$", name: "New Zealand dollar", perUSD: 1.75 },
	SGD: { symbol: "S$", name: "Singapore dollar", perUSD: 1.3 },
	AED: { symbol: "AED ", name: "UAE dirham", perUSD: 3.67 },
	JPY: { symbol: "¥", name: "Japanese yen", perUSD: 152 },
	CHF: { symbol: "CHF ", name: "Swiss franc", perUSD: 0.8 },
	SEK: { symbol: "SEK ", name: "Swedish krona", perUSD: 9.5 },
	BRL: { symbol: "R$", name: "Brazilian real", perUSD: 5.4 },
	ZAR: { symbol: "R ", name: "South African rand", perUSD: 17.5 },
	MXN: { symbol: "MX$", name: "Mexican peso", perUSD: 18.5 },
} as const;
export type Currency = keyof typeof CURRENCIES;
export const DEFAULT_CURRENCY: Currency = "USD";

export const isCurrency = (v: unknown): v is Currency => typeof v === "string" && v in CURRENCIES;

export function formatMoney(amount: number, code: Currency) {
	const decimals = amount % 1 === 0 || code === "JPY" ? 0 : 2;
	return `${CURRENCIES[code].symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function convert(amount: number, from: Currency, to: Currency) {
	return (amount / CURRENCIES[from].perUSD) * CURRENCIES[to].perUSD;
}

/** In the user's currency; anything else is converted and marked ≈ (the original stays in the tooltip). */
export function showMoney(amount: number, from: Currency | null | undefined, to: Currency) {
	const src = from ?? to;
	if (src === to) return formatMoney(amount, to);
	const approx = convert(amount, src, to);
	return `≈ ${formatMoney(approx >= 100 ? Math.round(approx) : Math.round(approx * 100) / 100, to)}`;
}

// Longest symbols first, so "NZ$" wins over "$".
const BY_SYMBOL = (Object.entries(CURRENCIES) as [Currency, (typeof CURRENCIES)[Currency]][])
	.map(([code, c]) => [c.symbol.trim(), code] as const)
	.sort((a, b) => b[0].length - a[0].length);

/** Reads a saved price like "₹455", "$12.99 Kindle", "INR 399" or "£8". Null when there's no clear amount. */
export function parsePrice(text: string): { amount: number; code: Currency } | null {
	const t = text.trim();
	const code = t.match(/^([A-Z]{3})\s?(\d[\d,]*(?:\.\d+)?)/);
	if (code && isCurrency(code[1])) return { amount: Number(code[2].replace(/,/g, "")), code: code[1] };
	for (const [sym, c] of BY_SYMBOL) {
		if (t.startsWith(sym)) {
			const m = t.slice(sym.length).trim().match(/^(\d[\d,]*(?:\.\d+)?)/);
			if (m) return { amount: Number(m[1].replace(/,/g, "")), code: c };
		}
	}
	return null;
}

/** A saved price text in the user's currency: unchanged if it already is, else "≈ converted (original)". */
export function showPriceText(text: string, to: Currency) {
	const p = parsePrice(text);
	if (!p || p.code === to) return text;
	return `${showMoney(p.amount, p.code, to)} (${text})`;
}
