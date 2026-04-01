import { AnthropicProvider } from "../provider";

describe("AnthropicProvider", () => {
	let provider: AnthropicProvider;

	beforeEach(() => {
		provider = new AnthropicProvider();
	});

	describe("prepareHeaders", () => {
		it("adds the required OAuth beta when using access tokens", () => {
			const headers = new Headers({
				"content-type": "application/json",
			});

			const prepared = provider.prepareHeaders(headers, "oauth-access-token");

			expect(prepared.get("authorization")).toBe(
				"Bearer oauth-access-token",
			);
			expect(prepared.get("anthropic-beta")).toBe("oauth-2025-04-20");
		});

		it("keeps requested Claude Code betas except known blocked ones", () => {
			const headers = new Headers({
				"anthropic-beta":
					"claude-code-20250219,context-1m-2025-08-07,interleaved-thinking-2025-05-14,advanced-tool-use-2025-11-20,effort-2025-11-24,custom-beta,oauth-2025-04-20",
			});

			const prepared = provider.prepareHeaders(headers, "oauth-access-token");

			expect(prepared.get("anthropic-beta")).toBe(
				"claude-code-20250219,interleaved-thinking-2025-05-14,advanced-tool-use-2025-11-20,effort-2025-11-24,custom-beta,oauth-2025-04-20",
			);
		});

		it("does not inject OAuth beta headers for API key accounts", () => {
			const headers = new Headers({
				"anthropic-beta": "claude-code-20250219,context-1m-2025-08-07",
			});

			const prepared = provider.prepareHeaders(headers, undefined, "api-key");

			expect(prepared.get("x-api-key")).toBe("api-key");
			expect(prepared.get("anthropic-beta")).toBe(
				"claude-code-20250219,context-1m-2025-08-07",
			);
		});
	});
});
