import {
	CLOUDFLARE_OAUTH_CLIENT_ID,
	CLOUDFLARE_TOKEN_URL,
	OAUTH_CALLBACK_URL,
} from "./constants";

type TokenSuccessResponse = {
	access_token: string;
	expires_in: number;
	refresh_token?: string;
	scope?: string;
};

type TokenErrorResponse = {
	error: string;
	error_description?: string;
};

export type OAuthAccessContext = {
	accessToken: string;
	expiresAt: string;
	refreshToken?: string;
	scopes: string[];
};

export class OAuthExchangeError extends Error {
	errorCode: string;
	debug: Record<string, unknown>;

	constructor(
		message: string,
		errorCode: string,
		debug: Record<string, unknown>,
	) {
		super(message);
		this.name = "OAuthExchangeError";
		this.errorCode = errorCode;
		this.debug = debug;
	}
}

export async function exchangeAuthCodeForAccessToken(input: {
	authorizationCode: string;
	codeVerifier: string;
}): Promise<OAuthAccessContext> {
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		code: input.authorizationCode,
		redirect_uri: OAUTH_CALLBACK_URL,
		client_id: CLOUDFLARE_OAUTH_CLIENT_ID,
		code_verifier: input.codeVerifier,
	});

	const response = await fetch(CLOUDFLARE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: params.toString(),
	});

	const body = (await response.json()) as
		| TokenSuccessResponse
		| TokenErrorResponse;

	const debug = {
		step: "token_exchange",
		response: {
			status: response.status,
			ok: response.ok,
			statusText: response.statusText,
			body,
		},
	};

	if (!response.ok || "error" in body) {
		const message =
			"error" in body
				? (body.error_description ?? body.error)
				: "Falha ao trocar código OAuth por token.";
		const errorCode =
			"error" in body && body.error === "access_denied"
				? "oauth_denied"
				: "invalid_token";
		throw new OAuthExchangeError(message, errorCode, debug);
	}

	return {
		accessToken: body.access_token,
		expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
		refreshToken: body.refresh_token,
		scopes: body.scope ? body.scope.split(" ") : [],
	};
}
