// Hub website: server-rendered pages, no framework. One file per area; this one wires them up behind sign-in.

import { Hono } from "hono";
import { clearSessionCookie, isOwner, readSession } from "../session";
import { book } from "./book";
import { lists } from "./lists";
import { more } from "./more";
import { notes } from "./notes";
import { notices } from "./notices";
import { newNoticeCount } from "../notices";
import { getSetting } from "../db";
import { isAiApp, page, type HubEnv } from "./ui";

export const hub = new Hono<HubEnv>();

hub.use("*", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!isOwner(login, c.env.OWNER_GITHUB_LOGIN)) return c.redirect("/login");
	// Forms only work from the hub itself (cookies are SameSite=Lax too; this is a second lock).
	if (c.req.method === "POST") {
		const origin = c.req.header("Origin");
		if (origin && origin !== new URL(c.req.url).origin) return c.text("Forbidden", 403);
	}
	c.set("login", login!);
	const ai = await getSetting(c.env.DB, "ai_app");
	if (isAiApp(ai)) c.set("aiApp", ai);
	if (c.req.method === "GET") c.set("noticeCount", await newNoticeCount(c.env.DB));
	await next();
});

hub.get("/logout", () => new Response(null, { status: 302, headers: { Location: "/signed-out", "Set-Cookie": clearSessionCookie() } }));

hub.route("/", lists);
hub.route("/", book);
hub.route("/", notes);
hub.route("/", more);
hub.route("/", notices);

export function signedOutPage() {
	return page("Signed out", `<main><h1>Book Hub</h1><p>You're signed out.</p><p><a class="btn" href="/login">Sign in with GitHub</a></p></main>`);
}
