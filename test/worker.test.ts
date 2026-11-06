import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { createMcpHandler } from "agents/mcp/server";
import { describe, expect, it } from "vitest";
import { listSources, saveSource } from "../src/db";
import { createServer } from "../src/mcp";
import { createSessionCookie } from "../src/session";

const worker = (exports as any).default;
const BASE = "https://book-hub.example.workers.dev";

async function sessionCookie(login: string) {
	return (await createSessionCookie(login, env.COOKIE_ENCRYPTION_KEY)).split(";")[0];
}

describe("hub access", () => {
	it("sends signed-out visitors to login", async () => {
		const res = await worker.fetch(new Request(`${BASE}/`), { redirect: "manual" });
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/login");
	});
	it("rejects a valid session for a non-owner", async () => {
		const res = await worker.fetch(new Request(`${BASE}/`, { headers: { Cookie: await sessionCookie("someone") } }), { redirect: "manual" });
		expect(res.status).toBe(302);
	});
	it("shows the owner their library, with HTML escaped", async () => {
		await saveSource(env.DB, { title: "<script>x</script>", authors: ["Test"], confirm_new: true });
		const res = await worker.fetch(new Request(`${BASE}/discover`, { headers: { Cookie: await sessionCookie("owner") } }));
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
		expect(html).not.toContain("<script>x</script>");
	});
	it("login redirects to GitHub with a state cookie", async () => {
		const res = await worker.fetch(new Request(`${BASE}/login`), { redirect: "manual" });
		const location = new URL(res.headers.get("Location")!);
		expect(location.host).toBe("github.com");
		expect(location.searchParams.get("redirect_uri")).toBe(`${BASE}/callback/hub`);
		expect(res.headers.get("Set-Cookie")).toContain(location.searchParams.get("state")!);
	});
	it("hub callback rejects a mismatched state", async () => {
		const res = await worker.fetch(new Request(`${BASE}/callback/hub?state=a&code=b`, { headers: { Cookie: "__Host-hub_login_state=c" } }));
		expect(res.status).toBe(400);
	});
});

describe("connector", () => {
	it("refuses Claude without a sign-in token", async () => {
		const res = await worker.fetch(new Request(`${BASE}/mcp`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }));
		expect(res.status).toBe(401);
	});
	it("advertises OAuth so claude.ai can start sign-in", async () => {
		const res = await worker.fetch(new Request(`${BASE}/.well-known/oauth-authorization-server`));
		expect(res.status).toBe(200);
		expect((await res.json() as any).authorization_endpoint).toContain("/authorize");
	});
	it("works out its own connector address when none is configured", async () => {
		const res = await worker.fetch(new Request(`${BASE}/.well-known/oauth-protected-resource/mcp`));
		expect(res.status).toBe(200);
		expect(((await res.json()) as any).resource).toBe(`${BASE}/mcp`);
		const other = await worker.fetch(new Request("https://books.example.org/.well-known/oauth-protected-resource/mcp"));
		expect(((await other.json()) as any).resource).toBe("https://books.example.org/mcp");
	});
	it("saves a book through the tool and has no delete tool", async () => {
		const handler = createMcpHandler(createServer, { authContext: { props: { login: "owner" } } });
		const call = (body: unknown) =>
			handler(
				new Request("http://localhost/mcp", {
					method: "POST",
					headers: { Host: "localhost", "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
					body: JSON.stringify(body),
				}),
				env,
				{ waitUntil() {}, passThroughOnException() {} } as any,
			);
		const readJson = async (res: Response) => {
			const text = await res.text(); 
			const data = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5);
			return JSON.parse(data);
		};

		const list = await readJson(await call({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
		const names = list.result.tools.map((t: any) => t.name);
		expect(names).toEqual(
			expect.arrayContaining(["get_rules", "lookup_book", "save_source", "get_source", "search_library", "set_library_status", "add_note", "save_review", "log_request", "save_feedback", "hub_status"]),
		);
		expect(names.some((n: string) => /delete|remove/i.test(n))).toBe(false);

		const saved = await readJson(
			await call({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: { name: "save_source", arguments: { title: "Via Tool", authors: ["Someone Unique"], library_status: "on_shelf" } },
			}),
		);
		expect(JSON.parse(saved.result.content[0].text).status).toBe("created");
		expect(JSON.parse(saved.result.content[0].text).hub_url).toMatch(/^http:\/\/localhost\/book\/\d+$/);
		// v1 status name still accepted (backward compatibility) and stored as the v2 name.
		expect((await listSources(env.DB, { query: "Via Tool" }))[0].library_status).toBe("own");

		const rules = await readJson(await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_rules", arguments: { names: ["honesty"] } } }));
		expect(rules.result.content[0].text).toContain("# Honesty rules");
		expect(rules.result.content[0].text).toContain("The user's currency is USD");
		const tools = list.result.tools.map((t: any) => t.name);
		expect(tools.filter((n: string) => /rule|taste/.test(n) && n !== "get_rules")).toEqual([]); // the AI can only read rules

	});
});

describe("local test connector", () => {
	it("doesn't exist on the deployed hub", async () => {
		const res = await worker.fetch(new Request(`${BASE}/mcp-dev`, { method: "POST", body: "{}" }));
		expect(res.status).toBe(404);
	});
});
