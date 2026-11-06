import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				bindings: {
					GITHUB_CLIENT_ID: "test-client",
					GITHUB_CLIENT_SECRET: "test-secret",
					COOKIE_ENCRYPTION_KEY: "test-cookie-key",
					OWNER_GITHUB_LOGIN: "owner",
					EXPORT_TOKEN: "test-export-token-0123456789abcdef0123",
					// Like a fresh install: no addresses configured, so the hub works them out from each request.
					MCP_RESOURCE: "",
					HUB_URL: "",
					TEST_MIGRATIONS: await readD1Migrations("./migrations"),
				},
			},
		})),
	],
	test: { setupFiles: ["./test/apply-migrations.ts"] },
});
