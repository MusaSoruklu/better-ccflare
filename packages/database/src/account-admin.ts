export type AccountAdminState = {
	quarantined: boolean;
	quarantined_at: number | null;
	quarantine_reason: string | null;
};

export function normalizeQuarantineReason(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length ? trimmed.slice(0, 500) : null;
}
