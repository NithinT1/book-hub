// Machine endpoints for scripts (backup export, test results). Locked with a separate bearer token
// (EXPORT_TOKEN), so no browser session or GitHub login is involved. Read-only except test results.

import { Hono } from "hono";
import type { Bindings } from "./auth";
import { saveTestRun } from "./db";
import { buildMarkdownExport } from "./export";

export const api = new Hono<{ Bindings: Bindings }>();

api.use("/api/*", async (c, next) => {
	const token = c.env.EXPORT_TOKEN;
	const given = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
	if (!token || token.length < 32 || !timingSafeEqual(given, token)) return c.text("Unauthorized", 401);
	await next();
});

api.get("/api/export.md", async (c) => new Response(await buildMarkdownExport(c.env.DB), { headers: { "Content-Type": "text/markdown; charset=utf-8" } }));

api.post("/api/test-runs", async (c) => {
	const body = await c.req.json<{ passed?: number; failed?: number; results?: unknown[] }>().catch(() => null);
	if (!body || typeof body !== "object") return c.text("Bad request", 400);
	const row = await saveTestRun(c.env.DB, body);
	return c.json({ id: row!.id });
});

function timingSafeEqual(a: string, b: string) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
