const CLOUDFLARE_VERIFY_URL =
	"https://api.cloudflare.com/client/v4/user/tokens/verify";

export type CloudflareTokenValidationResult = {
	success: boolean;
	errorCode?: string;
	message?: string;
	debug: Record<string, unknown>;
};

export async function validateCloudflareToken(
	token: string,
): Promise<CloudflareTokenValidationResult> {
	const trimmedToken = token.trim();

	if (!trimmedToken) {
		return {
			success: false,
			errorCode: "missing_token",
			message: "Token vazio.",
			debug: {
				step: "input_validation",
				reason: "empty_token",
			},
		};
	}

	const startedAt = new Date().toISOString();

	try {
		const response = await fetch(CLOUDFLARE_VERIFY_URL, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${trimmedToken}`,
				"Content-Type": "application/json",
			},
		});

		const body = (await response.json()) as {
			success?: boolean;
			errors?: Array<{ code?: number; message?: string }>;
			messages?: string[];
			result?: {
				id?: string;
				status?: string;
			};
		};

		const debug = {
			step: "cloudflare_verify",
			startedAt,
			request: {
				url: CLOUDFLARE_VERIFY_URL,
				method: "GET",
			},
			response: {
				status: response.status,
				ok: response.ok,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
				body,
			},
		};

		if (!response.ok || !body.success) {
			const apiMessage = body.errors?.[0]?.message;
			const tokenStatus = body.result?.status;

			if (tokenStatus && tokenStatus !== "active") {
				return {
					success: false,
					errorCode: "token_inactive",
					message: apiMessage ?? `Token com status "${tokenStatus}".`,
					debug,
				};
			}

			return {
				success: false,
				errorCode: "invalid_token",
				message: apiMessage ?? "Token rejeitado pela API do Cloudflare.",
				debug,
			};
		}

		return {
			success: true,
			debug,
		};
	} catch (error) {
		return {
			success: false,
			errorCode: "network_error",
			message:
				error instanceof Error
					? error.message
					: "Erro desconhecido ao validar token.",
			debug: {
				step: "cloudflare_verify",
				startedAt,
				request: {
					url: CLOUDFLARE_VERIFY_URL,
					method: "GET",
				},
				error:
					error instanceof Error
						? {
								name: error.name,
								message: error.message,
								stack: error.stack,
							}
						: error,
			},
		};
	}
}
