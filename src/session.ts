// Signed hub session cookie and the single-owner rule shared by hub and connector.

const SESSION_COOKIE = "__Host-hub_session";
const SESSION_DAYS = 30;

/** Fails closed: if OWNER_GITHUB_LOGIN is unset, nobody is the owner. */
export function isOwner(login: string | undefined | null, ownerLogin: string | undefined): boolean {
	if (!login || !ownerLogin) return false;
	return login.toLowerCase() === ownerLogin.trim().toLowerCase();
}

export async function createSessionCookie(login: string, secret: string, now = Date.now()): Promise<string> {
	const payload = btoa(JSON.stringify({ login, exp: now + SESSION_DAYS * 86400_000 }));
	const sig = await hmac(payload, secret);
	return `${SESSION_COOKIE}=${payload}.${sig}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie(): string {
	return `${SESSION_COOKIE}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`;
}

/** Returns the signed-in login, or null if the cookie is missing, tampered with or expired. */
export async function readSession(request: Request, secret: string, now = Date.now()): Promise<string | null> {
	const value = getCookie(request, SESSION_COOKIE);
	if (!value) return null;
	const [payload, sig] = value.split(".");
	if (!payload || !sig) return null;
	if (!timingSafeEqual(sig, await hmac(payload, secret))) return null;
	try {
		const { login, exp } = JSON.parse(atob(payload));
		return typeof login === "string" && typeof exp === "number" && exp > now ? login : null;
	} catch {
		return null;
	}
}

export function getCookie(request: Request, name: string): string | null {
	const header = request.headers.get("Cookie") ?? "";
	for (const part of header.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === name) return v.join("=");
	}
	return null;
}

async function hmac(data: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
	return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
