import { afterEach, describe, expect, it } from "bun:test";
import {
	isLocalProxyAuthFailure,
	readLocalProxySecret,
} from "../auto-refresh-scheduler";

const ORIGINAL_PROXY_SECRET = process.env.CLAUDE_UPSTREAM_PROXY_SECRET;

afterEach(() => {
	if (typeof ORIGINAL_PROXY_SECRET === "string") {
		process.env.CLAUDE_UPSTREAM_PROXY_SECRET = ORIGINAL_PROXY_SECRET;
	} else {
		delete process.env.CLAUDE_UPSTREAM_PROXY_SECRET;
	}
});

describe("auto-refresh scheduler private access helpers", () => {
	it("reads the local proxy secret from CLAUDE_UPSTREAM_PROXY_SECRET", () => {
		process.env.CLAUDE_UPSTREAM_PROXY_SECRET = "  secret-value  ";
		expect(readLocalProxySecret()).toBe("secret-value");
	});

	it("treats an empty proxy secret as missing", () => {
		process.env.CLAUDE_UPSTREAM_PROXY_SECRET = "   ";
		expect(readLocalProxySecret()).toBeNull();
	});

	it("detects local proxy auth failures from the 401 body", () => {
		expect(
			isLocalProxyAuthFailure(
				'{"type":"error","error":{"type":"proxy_auth_required","message":"Valid x-claude-proxy-secret is required"}}',
			),
		).toBe(true);
		expect(
			isLocalProxyAuthFailure("Valid x-claude-proxy-secret is required"),
		).toBe(true);
		expect(
			isLocalProxyAuthFailure(
				'{"type":"error","error":{"type":"invalid_grant","message":"refresh token invalid"}}',
			),
		).toBe(false);
	});
});
