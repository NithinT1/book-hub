// Sign-in for both doors, via GitHub, locked to OWNER_GITHUB_LOGIN.
// - Connector (Claude): /authorize → GitHub → /callback → token issued to Claude.
// - Hub (browser):      /login     → GitHub → /callback/hub → session cookie.
// GitHub only allows redirect paths under the registered callback, so the OAuth app's callback is /callback.
// Adapted from cloudflare/ai demos/remote-mcp-github-oauth (MIT).

import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { createSessionCookie, getCookie, isOwner } from "./session";
import {
	addApprovedClient,
	bindStateToSession,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	renderApprovalDialog,
	validateCSRFToken,
	validateOAuthState,
} from "./workers-oauth-utils";

export type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };
export const auth = new Hono<{ Bindings: Bindings }>();

const HUB_STATE_COOKIE = "__Host-hub_login_state";

// ---- Connector sign-in -------------------------------------------------------

auth.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	if (!oauthReqInfo.clientId) return c.text("Invalid request", 400);

	if (await isClientApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie } = await bindStateToSession(stateToken);
		return redirectToGitHub(c.req.raw, c.env, stateToken, "/callback", [setCookie]);
	}

	const { token: csrfToken, setCookie } = generateCSRFProtection();
	return renderApprovalDialog(c.req.raw, {
		client: await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId),
		csrfToken,
		server: { name: "Book Hub", description: "Your private Book Hub. Only the owner's GitHub account can sign in." },
		setCookie,
		state: { oauthReqInfo },
	});
});

auth.post("/authorize", async (c) => {
	try {
		const formData = await c.req.raw.formData();
		validateCSRFToken(formData, c.req.raw);
		const encoded = formData.get("state");
		if (typeof encoded !== "string") return c.text("Missing state", 400);
		let state: { oauthReqInfo?: AuthRequest };
		try {
			state = JSON.parse(atob(encoded));
		} catch {
			return c.text("Invalid state", 400);
		}
		if (!state.oauthReqInfo?.clientId) return c.text("Invalid request", 400);

		const approved = await addApprovedClient(c.req.raw, state.oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY);
		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
		const { setCookie } = await bindStateToSession(stateToken);
		return redirectToGitHub(c.req.raw, c.env, stateToken, "/callback", [approved, setCookie]);
	} catch (error) {
		if (error instanceof OAuthError) return error.toResponse();
		console.error("POST /authorize", error);
		return c.text("Internal server error", 500);
	}
});

auth.get("/callback", async (c) => {
	let oauthReqInfo: AuthRequest;
	let clearCookie: string;
	try {
		({ oauthReqInfo, clearCookie } = await validateOAuthState(c.req.raw, c.env.OAUTH_KV));
	} catch (error) {
		if (error instanceof OAuthError) return error.toResponse();
		return c.text("Internal server error", 500);
	}
	if (!oauthReqInfo.clientId) return c.text("Invalid OAuth request", 400);

	const login = await githubLogin(c.env, c.req.query("code"), new URL("/callback", c.req.url).href);
	if (!isOwner(login, c.env.OWNER_GITHUB_LOGIN)) return c.text("This Book Hub belongs to someone else.", 403);

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: login!,
		metadata: { label: login },
		scope: oauthReqInfo.scope,
		props: { login },
	});
	return new Response(null, { status: 302, headers: { Location: redirectTo, "Set-Cookie": clearCookie } });
});

// ---- Hub sign-in -------------------------------------------------------------

auth.get("/login", (c) => {
	const state = crypto.randomUUID();
	return redirectToGitHub(c.req.raw, c.env, state, "/callback/hub", [
		`${HUB_STATE_COOKIE}=${state}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
	]);
});

auth.get("/callback/hub", async (c) => {
	const state = c.req.query("state");
	if (!state || state !== getCookie(c.req.raw, HUB_STATE_COOKIE)) return c.text("Sign-in expired. Go back and try again.", 400);

	const login = await githubLogin(c.env, c.req.query("code"), new URL("/callback/hub", c.req.url).href);
	if (!isOwner(login, c.env.OWNER_GITHUB_LOGIN)) return c.text("This Book Hub belongs to someone else.", 403);

	const headers = new Headers({ Location: "/" });
	headers.append("Set-Cookie", await createSessionCookie(login!, c.env.COOKIE_ENCRYPTION_KEY));
	headers.append("Set-Cookie", `${HUB_STATE_COOKIE}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
	return new Response(null, { status: 302, headers });
});

// ---- GitHub helpers ----------------------------------------------------------

function redirectToGitHub(request: Request, env: Env, state: string, callbackPath: string, cookies: string[]) {
	const url = new URL("https://github.com/login/oauth/authorize");
	url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
	url.searchParams.set("redirect_uri", new URL(callbackPath, request.url).href);
	url.searchParams.set("scope", "read:user");
	url.searchParams.set("state", state);
	const headers = new Headers({ Location: url.href });
	for (const cookie of cookies) headers.append("Set-Cookie", cookie);
	return new Response(null, { status: 302, headers });
}

/** Exchanges the GitHub code for the user's login name. Returns null on any failure. */
async function githubLogin(env: Env, code: string | undefined, redirectUri: string): Promise<string | null> {
	if (!code) return null;
	const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: new URLSearchParams({
			client_id: env.GITHUB_CLIENT_ID,
			client_secret: env.GITHUB_CLIENT_SECRET,
			code,
			redirect_uri: redirectUri,
		}),
	});
	const { access_token } = (await tokenResp.json()) as { access_token?: string };
	if (!access_token) return null;
	const userResp = await fetch("https://api.github.com/user", {
		headers: { Authorization: `Bearer ${access_token}`, "User-Agent": "book-hub", Accept: "application/vnd.github+json" },
	});
	if (!userResp.ok) return null;
	const { login } = (await userResp.json()) as { login?: string };
	return login ?? null;
}
