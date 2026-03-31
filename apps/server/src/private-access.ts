import { timingSafeEqual } from "node:crypto";

const INTERNAL_ADMIN_PREFIX = "/internal/admin/";
const ADMIN_ALLOWED_PATHS = [
	"/internal/admin/health",
	"/internal/admin/stats",
	"/internal/admin/accounts",
	"/internal/admin/oauth/init",
	"/internal/admin/oauth/callback",
	"/internal/admin/token-health",
	"/internal/admin/token-health/reauth-needed",
] as const;

type RequestGate =
	| { allowed: true; kind: "health" | "admin" | "proxy" | "other" }
	| { allowed: false; status: number; code: string; message: string };

function readBooleanEnv(raw: string | undefined, fallback = false): boolean {
	if (!raw?.trim()) return fallback;
	const normalized = raw.trim().toLowerCase();
	if (["1", "true", "yes", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "off"].includes(normalized)) return false;
	return fallback;
}

function trimmedEnv(name: string): string {
	return process.env[name]?.trim() || "";
}

export function isPrivateAccessEnforced(): boolean {
	return readBooleanEnv(process.env.CLAUDE_UPSTREAM_ENFORCE_PRIVATE_ACCESS, false);
}

export function isDashboardDisabledInProduction(): boolean {
	if (isPrivateAccessEnforced()) return true;
	return readBooleanEnv(process.env.CLAUDE_UPSTREAM_DISABLE_DASHBOARD, false);
}

export function validatePrivateAccessRuntime(): void {
	if (!isPrivateAccessEnforced()) return;

	const missing: string[] = [];
	if (!trimmedEnv("CLAUDE_UPSTREAM_PROXY_SECRET")) {
		missing.push("CLAUDE_UPSTREAM_PROXY_SECRET");
	}
	if (!trimmedEnv("CLAUDE_UPSTREAM_ADMIN_TOKEN")) {
		missing.push("CLAUDE_UPSTREAM_ADMIN_TOKEN");
	}
	if (!trimmedEnv("CLAUDE_UPSTREAM_TOKEN_ENCRYPTION_KEY")) {
		missing.push("CLAUDE_UPSTREAM_TOKEN_ENCRYPTION_KEY");
	}
	if (!trimmedEnv("DATABASE_URL")) {
		missing.push("DATABASE_URL");
	}
	if (missing.length > 0) {
		throw new Error(
			`Private Claude upstream mode requires: ${missing.join(", ")}`,
		);
	}
}

function safeEquals(a: string, b: string): boolean {
	if (a.length === 0 || a.length !== b.length) {
		return false;
	}
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isAllowedAdminPath(path: string): boolean {
	if (ADMIN_ALLOWED_PATHS.includes(path as (typeof ADMIN_ALLOWED_PATHS)[number])) {
		return true;
	}

	if (!path.startsWith("/internal/admin/accounts/")) {
		return false;
	}

	return /(\/pause|\/resume|\/quarantine|\/unquarantine|\/reload|\/force-reset-rate-limit)$/.test(
		path,
	);
}

function classifyPath(path: string): "health" | "admin" | "proxy" | "blocked" | "other" {
	if (path === "/health") return "health";
	if (path.startsWith(INTERNAL_ADMIN_PREFIX)) return "admin";
	if (path.startsWith("/v1/") || path.startsWith("/messages/")) return "proxy";
	if (path.startsWith("/api/")) return "blocked";
	return "other";
}

export function authorizePrivateRequest(req: Request, path: string): RequestGate {
	if (!isPrivateAccessEnforced()) {
		return { allowed: true, kind: "other" };
	}

	const kind = classifyPath(path);
	if (kind === "health") {
		return { allowed: true, kind };
	}
	if (kind === "admin") {
		if (!isAllowedAdminPath(path)) {
			return {
				allowed: false,
				status: 404,
				code: "not_found",
				message: "Not found",
			};
		}
		const expected = trimmedEnv("CLAUDE_UPSTREAM_ADMIN_TOKEN");
		const provided = req.headers.get("x-claude-admin-token")?.trim() || "";
		if (!safeEquals(provided, expected)) {
			return {
				allowed: false,
				status: 401,
				code: "admin_auth_required",
				message: "Valid x-claude-admin-token is required",
			};
		}
		return { allowed: true, kind };
	}
	if (kind === "proxy") {
		const expected = trimmedEnv("CLAUDE_UPSTREAM_PROXY_SECRET");
		const provided = req.headers.get("x-claude-proxy-secret")?.trim() || "";
		if (!safeEquals(provided, expected)) {
			return {
				allowed: false,
				status: 401,
				code: "proxy_auth_required",
				message: "Valid x-claude-proxy-secret is required",
			};
		}
		return { allowed: true, kind };
	}
	if (kind === "blocked") {
		return {
			allowed: false,
			status: 404,
			code: "not_found",
			message: "Not found",
		};
	}
	return {
		allowed: false,
		status: 404,
		code: "not_found",
		message: "Not found",
	};
}
