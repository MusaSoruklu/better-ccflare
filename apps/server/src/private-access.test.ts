import { afterEach, describe, expect, test } from "bun:test";
import { authorizePrivateRequest } from "./private-access";

const ORIGINAL_ENV = {
	CLAUDE_UPSTREAM_ENFORCE_PRIVATE_ACCESS:
		process.env.CLAUDE_UPSTREAM_ENFORCE_PRIVATE_ACCESS,
	CLAUDE_UPSTREAM_ADMIN_TOKEN: process.env.CLAUDE_UPSTREAM_ADMIN_TOKEN,
	CLAUDE_UPSTREAM_PROXY_SECRET: process.env.CLAUDE_UPSTREAM_PROXY_SECRET,
};

function setPrivateModeEnv() {
	process.env.CLAUDE_UPSTREAM_ENFORCE_PRIVATE_ACCESS = "true";
	process.env.CLAUDE_UPSTREAM_ADMIN_TOKEN = "admin-secret";
	process.env.CLAUDE_UPSTREAM_PROXY_SECRET = "proxy-secret";
}

afterEach(() => {
	process.env.CLAUDE_UPSTREAM_ENFORCE_PRIVATE_ACCESS =
		ORIGINAL_ENV.CLAUDE_UPSTREAM_ENFORCE_PRIVATE_ACCESS;
	process.env.CLAUDE_UPSTREAM_ADMIN_TOKEN =
		ORIGINAL_ENV.CLAUDE_UPSTREAM_ADMIN_TOKEN;
	process.env.CLAUDE_UPSTREAM_PROXY_SECRET =
		ORIGINAL_ENV.CLAUDE_UPSTREAM_PROXY_SECRET;
});

describe("private Claude upstream access", () => {
	test("allows health checks without credentials", () => {
		setPrivateModeEnv();
		const result = authorizePrivateRequest(
			new Request("http://localhost/health"),
			"/health",
		);
		expect(result).toEqual({ allowed: true, kind: "health" });
	});

	test("allows explicitly approved admin endpoints with the admin token", () => {
		setPrivateModeEnv();
		const result = authorizePrivateRequest(
			new Request("http://localhost/internal/admin/accounts", {
				headers: { "x-claude-admin-token": "admin-secret" },
			}),
			"/internal/admin/accounts",
		);
		expect(result).toEqual({ allowed: true, kind: "admin" });
	});

	test("rejects unapproved admin endpoints even with the admin token", () => {
		setPrivateModeEnv();
		const result = authorizePrivateRequest(
			new Request("http://localhost/internal/admin/api-keys", {
				headers: { "x-claude-admin-token": "admin-secret" },
			}),
			"/internal/admin/api-keys",
		);
		expect(result).toEqual({
			allowed: false,
			status: 404,
			code: "not_found",
			message: "Not found",
		});
	});

	test("requires the proxy secret for Claude proxy traffic", () => {
		setPrivateModeEnv();
		const result = authorizePrivateRequest(
			new Request("http://localhost/v1/messages"),
			"/v1/messages",
		);
		expect(result).toEqual({
			allowed: false,
			status: 401,
			code: "proxy_auth_required",
			message: "Valid x-claude-proxy-secret is required",
		});
	});
});
