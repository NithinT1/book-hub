import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { Hono } from "hono";
import { api } from "./api";
import { auth, type Bindings } from "./auth";
import { hub, signedOutPage } from "./hub";
import { createServer } from "./mcp";

const mcpHandler = createMcpHandler(createServer);

// Everything that isn't the connector: sign-in routes first (public), then the hub (owner only).
const app = new Hono<{ Bindings: Bindings }>();
app.route("/", auth);
app.route("/", api);
app.get("/signed-out", (c) => c.html(signedOutPage()));
app.route("/", hub);

// The connector's address is this worker's own URL + /mcp, worked out from the request — unless MCP_RESOURCE pins it.
const providers = new Map<string, OAuthProvider<Env>>();
function oauthFor(origin: string) {
	const resource = env.MCP_RESOURCE || `${origin}/mcp`;
	let provider = providers.get(resource);
	if (!provider) {
		provider = new OAuthProvider<Env>({
			apiRoute: "/mcp",
			apiHandler: { fetch: (request: Request, bindings: Env, ctx: ExecutionContext) => mcpHandler(request, bindings, ctx) },
			defaultHandler: app as any,
			authorizeEndpoint: "/authorize",
			tokenEndpoint: "/token",
			clientRegistrationEndpoint: "/register",
			resourceMetadata: { resource },
		});
		providers.set(resource, provider);
	}
	return provider;
}

// Local behaviour tests only: an unauthenticated connector at /mcp-dev that exists only when DEV_NO_AUTH=1
// (set in the gitignored .dev.vars) AND the request is to localhost — never on the deployed hub.
const devMcp = createMcpHandler(createServer, { route: "/mcp-dev", authContext: { props: { login: "local-test" } } });

export default {
	fetch(request: Request, bindings: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.pathname === "/mcp-dev") {
			const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
			if (String(bindings.DEV_NO_AUTH) === "1" && local) return devMcp(request, bindings, ctx);
			return new Response("Not found", { status: 404 });
		}
		return oauthFor(url.origin).fetch(request, bindings, ctx);
	},
} satisfies ExportedHandler<Env>;
