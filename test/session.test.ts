import { describe, expect, it } from "vitest";
import { createSessionCookie, isOwner, readSession } from "../src/session";

const SECRET = "s3cret";
const asRequest = (setCookie: string) => new Request("https://hub.test/", { headers: { Cookie: setCookie.split(";")[0] } });

describe("isOwner", () => {
	it("matches case-insensitively", () => expect(isOwner("Owner", "owner")).toBe(true));
	it("rejects other users", () => expect(isOwner("someone", "owner")).toBe(false));
	it("fails closed when owner is not configured", () => expect(isOwner("owner", undefined)).toBe(false));
	it("rejects missing login", () => expect(isOwner(null, "owner")).toBe(false));
});

describe("session cookie", () => {
	it("round-trips a valid session", async () => {
		expect(await readSession(asRequest(await createSessionCookie("owner", SECRET)), SECRET)).toBe("owner");
	});
	it("rejects a cookie signed with another secret", async () => {
		expect(await readSession(asRequest(await createSessionCookie("owner", "other")), SECRET)).toBeNull();
	});
	it("rejects a tampered payload", async () => {
		const cookie = await createSessionCookie("owner", SECRET);
		const [name, value] = cookie.split(";")[0].split("=");
		const [, sig] = value.split(".");
		const forged = `${name}=${btoa(JSON.stringify({ login: "attacker", exp: Date.now() + 1e9 }))}.${sig}`;
		expect(await readSession(asRequest(forged), SECRET)).toBeNull();
	});
	it("rejects an expired session", async () => {
		const cookie = await createSessionCookie("owner", SECRET, Date.now() - 31 * 86400_000);
		expect(await readSession(asRequest(cookie), SECRET)).toBeNull();
	});
});
