declare global {
	interface Window {
		__BETTER_CCFLARE_BASENAME__?: string;
		__BETTER_CCFLARE_API_BASE__?: string;
	}
}

const BASENAME_META_NAME = "better-ccflare-basename";
const API_BASE_META_NAME = "better-ccflare-api-base";

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/g, "");
}

function normalizeBasePath(value: string | undefined): string {
	const trimmed = trimTrailingSlash((value || "").trim());
	if (!trimmed) return "";
	if (trimmed === "/") return "";
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isAbsoluteUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function readMetaContent(name: string): string {
	if (typeof document === "undefined") return "";
	const content =
		document
			.querySelector(`meta[name="${name}"]`)
			?.getAttribute("content")
			?.trim() || "";
	return content;
}

export function getDashboardBasename(): string {
	if (typeof window === "undefined") return "";
	const explicit =
		readMetaContent(BASENAME_META_NAME) ||
		(window.__BETTER_CCFLARE_BASENAME__ || "").trim();
	return normalizeBasePath(explicit);
}

export function getDashboardApiBase(): string {
	if (typeof window === "undefined") return "/api";
	const explicit =
		readMetaContent(API_BASE_META_NAME) ||
		(window.__BETTER_CCFLARE_API_BASE__ || "").trim();
	if (explicit) {
		if (isAbsoluteUrl(explicit)) return explicit;
		return normalizeBasePath(explicit) || "/api";
	}
	const basename = getDashboardBasename();
	return basename ? `${basename}/api` : "/api";
}

export function resolveDashboardPath(path: string): string {
	if (!path) return getDashboardBasename() || "/";
	if (isAbsoluteUrl(path)) return path;
	if (!path.startsWith("/")) return path;
	const basename = getDashboardBasename();
	if (!basename) return path;
	if (path === "/") return `${basename}/`;
	return `${basename}${path}`;
}

export function resolveDashboardApiPath(path: string): string {
	if (!path) return getDashboardApiBase();
	if (isAbsoluteUrl(path)) return path;
	if (path.startsWith("/api/")) {
		return `${getDashboardApiBase()}${path.slice("/api".length)}`;
	}
	if (path === "/api") {
		return getDashboardApiBase();
	}
	return resolveDashboardPath(path);
}
