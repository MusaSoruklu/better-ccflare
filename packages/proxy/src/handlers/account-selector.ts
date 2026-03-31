import { Logger } from "@better-ccflare/logger";
import {
	getRepresentativeUtilization,
	getRepresentativeWindow,
	type UsageData,
	usageCache,
} from "@better-ccflare/providers";
import type { Account, RequestMeta } from "@better-ccflare/types";
import type { ProxyContext } from "./proxy-types";

const log = new Logger("AccountSelector");

function usageStopPercent(): number {
	const parsed = Number(
		process.env.CLAUDE_UPSTREAM_STOP_AT_UTILIZATION_PERCENT?.trim() || "",
	);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return 90;
	}
	return Math.max(1, Math.min(100, Math.round(parsed)));
}

function accountHasUsageHeadroom(account: Account): boolean {
	if (account.provider !== "anthropic" && account.provider !== "claude-oauth") {
		return true;
	}

	const usageData = usageCache.get(account.id) as UsageData | null;
	if (!usageData || typeof usageData !== "object") {
		return true;
	}

	const utilization = getRepresentativeUtilization(usageData);
	if (typeof utilization !== "number" || !Number.isFinite(utilization)) {
		return true;
	}

	if (utilization < usageStopPercent()) {
		return true;
	}

	const window = getRepresentativeWindow(usageData) || "unknown";
	log.warn(
		`Skipping account ${account.name} because usage utilization is too high (${utilization}% on ${window})`,
	);
	return false;
}

/**
 * Gets accounts ordered by the load balancing strategy
 * @param meta - Request metadata
 * @param ctx - The proxy context
 * @returns Array of ordered accounts
 */
export async function getOrderedAccounts(
	meta: RequestMeta,
	ctx: ProxyContext,
): Promise<Account[]> {
	try {
		const allAccounts = await ctx.dbOps.getAllAccounts();
		// Return all accounts - the provider will be determined dynamically per account
		return ctx.strategy.select(allAccounts, meta).filter(accountHasUsageHeadroom);
	} catch (error) {
		log.error("Failed to get accounts from database:", error);
		console.error("\n❌ DATABASE ERROR DETECTED");
		console.error("═".repeat(50));
		console.error("The database encountered an error while loading accounts.");
		console.error(
			"This may indicate database corruption or integrity issues.\n",
		);
		console.error("To diagnose and repair the database, run:");
		console.error("  bun run cli --repair-db\n");
		console.error("The request will be rejected with service unavailable.");
		console.error(`${"═".repeat(50)}\n`);
		// Return empty array so the caller can fail closed with service unavailable.
		return [];
	}
}

/**
 * Selects accounts for a request based on the load balancing strategy
 * @param meta - Request metadata
 * @param ctx - The proxy context
 * @returns Array of selected accounts
 */
export async function selectAccountsForRequest(
	meta: RequestMeta,
	ctx: ProxyContext,
): Promise<Account[]> {
	// Check if a specific account is requested via special header
	if (meta.headers) {
		const forcedAccountId = meta.headers.get("x-better-ccflare-account-id");
		if (forcedAccountId) {
			try {
				const allAccounts = await ctx.dbOps.getAllAccounts();
				const forcedAccount = allAccounts.find(
					(acc) => acc.id === forcedAccountId,
				);
				if (forcedAccount && accountHasUsageHeadroom(forcedAccount)) {
					return [forcedAccount];
				}
				// If forced account not found, fall back to normal selection
			} catch (error) {
				log.error(
					"Failed to get accounts from database for forced account lookup:",
					error,
				);
				console.error("\n❌ DATABASE ERROR DETECTED");
				console.error("═".repeat(50));
				console.error(
					"The database encountered an error while looking up the requested account.",
				);
				console.error(
					"This may indicate database corruption or integrity issues.\n",
				);
				console.error("To diagnose and repair the database, run:");
				console.error("  bun run cli --repair-db\n");
				console.error("Falling back to normal account selection.");
				console.error(`${"═".repeat(50)}\n`);
				// Fall through to normal selection
			}
		}
	}

	return getOrderedAccounts(meta, ctx);
}
