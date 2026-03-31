import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTED_PREFIX = "enc:v1:";
const IV_BYTES = 12;

function credentialEncryptionKeyRaw(): string {
	return process.env.CLAUDE_UPSTREAM_TOKEN_ENCRYPTION_KEY?.trim() || "";
}

export function isCredentialEncryptionEnabled(): boolean {
	return credentialEncryptionKeyRaw().length > 0;
}

export function requireCredentialEncryptionKey(): void {
	if (!isCredentialEncryptionEnabled()) {
		throw new Error(
			"CLAUDE_UPSTREAM_TOKEN_ENCRYPTION_KEY is required for this environment",
		);
	}
}

function credentialEncryptionKey(): Buffer {
	const raw = credentialEncryptionKeyRaw();
	if (!raw) {
		throw new Error(
			"CLAUDE_UPSTREAM_TOKEN_ENCRYPTION_KEY is required to decrypt stored credentials",
		);
	}
	return createHash("sha256").update(raw, "utf8").digest();
}

export function isEncryptedCredentialValue(value: string | null | undefined): boolean {
	return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptCredentialValue(value: string | null | undefined): string | null {
	if (typeof value !== "string" || value.length === 0) {
		return value ?? null;
	}
	if (!isCredentialEncryptionEnabled() || isEncryptedCredentialValue(value)) {
		return value;
	}

	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", credentialEncryptionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(value, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return `${ENCRYPTED_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptCredentialValue(value: string | null | undefined): string | null {
	if (typeof value !== "string" || value.length === 0) {
		return value ?? null;
	}
	if (!isEncryptedCredentialValue(value)) {
		return value;
	}

	const payload = value.slice(ENCRYPTED_PREFIX.length);
	const [ivRaw, tagRaw, ciphertextRaw] = payload.split(".", 3);
	if (!ivRaw || !tagRaw || !ciphertextRaw) {
		throw new Error("Stored credential payload is malformed");
	}

	const decipher = createDecipheriv(
		"aes-256-gcm",
		credentialEncryptionKey(),
		Buffer.from(ivRaw, "base64url"),
	);
	decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
	const plaintext = Buffer.concat([
		decipher.update(Buffer.from(ciphertextRaw, "base64url")),
		decipher.final(),
	]);
	return plaintext.toString("utf8");
}

type CredentialRow = {
	api_key?: string | null;
	refresh_token?: string | null;
	access_token?: string | null;
};

export function decryptAccountCredentialRow<T extends CredentialRow>(row: T): T {
	return {
		...row,
		api_key: decryptCredentialValue(row.api_key),
		refresh_token: decryptCredentialValue(row.refresh_token),
		access_token: decryptCredentialValue(row.access_token),
	};
}
