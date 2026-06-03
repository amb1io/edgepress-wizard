import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validateCloudflareToken } from "../validate-token";
import {
	OAUTH_CALLBACK_HOST,
	OAUTH_CALLBACK_PORT,
	OAUTH_LOGIN_TIMEOUT_MS,
} from "./constants";
import {
	consumePendingOAuthFlow,
	createCompletedOAuthSession,
} from "./session-store";
import {
	exchangeAuthCodeForAccessToken,
	OAuthExchangeError,
} from "./token-exchange";

type CallbackServerState = {
	server: http.Server | null;
	startPromise: Promise<void> | null;
};

const globalState = globalThis as typeof globalThis & {
	__edgepressOAuthCallbackServer?: CallbackServerState;
};

function getCallbackServerState(): CallbackServerState {
	if (!globalState.__edgepressOAuthCallbackServer) {
		globalState.__edgepressOAuthCallbackServer = {
			server: null,
			startPromise: null,
		};
	}
	return globalState.__edgepressOAuthCallbackServer;
}

function redirect(res: ServerResponse, location: string) {
	res.writeHead(307, { Location: location });
	res.end();
}

function buildWizardErrorUrl(
	wizardOrigin: string,
	errorCode: string,
	debug?: Record<string, unknown>,
) {
	const url = new URL("/setup/1", wizardOrigin);
	url.searchParams.set("error", errorCode);
	if (debug) {
		url.searchParams.set("debug", btoa(JSON.stringify(debug)));
	}
	return url.toString();
}

async function handleOAuthCallback(req: IncomingMessage, res: ServerResponse) {
	const requestUrl = new URL(req.url ?? "/", "http://localhost");
	const defaultOrigin = "http://localhost:4321";

	if (requestUrl.pathname !== "/oauth/callback") {
		res.writeHead(404);
		res.end("Not found");
		return;
	}

	const oauthError = requestUrl.searchParams.get("error");
	if (oauthError) {
		const debug = {
			step: "oauth_callback",
			error: oauthError,
			description: requestUrl.searchParams.get("error_description"),
		};
		redirect(
			res,
			buildWizardErrorUrl(
				defaultOrigin,
				oauthError === "access_denied" ? "oauth_denied" : "invalid_token",
				debug,
			),
		);
		return;
	}

	const authorizationCode = requestUrl.searchParams.get("code");
	const stateQueryParam = requestUrl.searchParams.get("state");

	if (!authorizationCode || !stateQueryParam) {
		redirect(
			res,
			buildWizardErrorUrl(defaultOrigin, "oauth_missing_code", {
				step: "oauth_callback",
				reason: "missing_code_or_state",
			}),
		);
		return;
	}

	const pendingFlow = consumePendingOAuthFlow(stateQueryParam);
	if (!pendingFlow) {
		redirect(
			res,
			buildWizardErrorUrl(defaultOrigin, "oauth_state_mismatch", {
				step: "oauth_callback",
				reason: "unknown_or_expired_state",
			}),
		);
		return;
	}

	try {
		const tokens = await exchangeAuthCodeForAccessToken({
			authorizationCode,
			codeVerifier: pendingFlow.codeVerifier,
		});

		const validation = await validateCloudflareToken(tokens.accessToken);
		if (!validation.success) {
			redirect(
				res,
				buildWizardErrorUrl(
					pendingFlow.wizardOrigin,
					validation.errorCode ?? "invalid_token",
					validation.debug,
				),
			);
			return;
		}

		const sessionId = createCompletedOAuthSession(tokens);
		const successUrl = new URL("/setup/1", pendingFlow.wizardOrigin);
		successUrl.searchParams.set("oauth_session", sessionId);
		redirect(res, successUrl.toString());
	} catch (error) {
		const errorCode =
			error instanceof OAuthExchangeError ? error.errorCode : "network_error";
		const debug =
			error instanceof OAuthExchangeError
				? error.debug
				: {
						step: "oauth_callback",
						error:
							error instanceof Error
								? {
										name: error.name,
										message: error.message,
										stack: error.stack,
									}
								: error,
					};

		redirect(
			res,
			buildWizardErrorUrl(pendingFlow.wizardOrigin, errorCode, debug),
		);
	}
}

export async function ensureOAuthCallbackServer(): Promise<void> {
	const state = getCallbackServerState();
	if (state.server) return;
	if (state.startPromise) return state.startPromise;

	state.startPromise = new Promise<void>((resolve, reject) => {
		const server = http.createServer((req, res) => {
			void handleOAuthCallback(req, res);
		});

		server.once("error", (error: NodeJS.ErrnoException) => {
			state.server = null;
			state.startPromise = null;
			if (error.code === "EADDRINUSE") {
				reject(
					new Error(
						"A porta 8976 já está em uso. Feche outro processo OAuth (ex.: wrangler login) e tente novamente.",
					),
				);
				return;
			}
			reject(error);
		});

		server.listen(OAUTH_CALLBACK_PORT, OAUTH_CALLBACK_HOST, () => {
			state.server = server;
			resolve();
		});
	});

	return state.startPromise;
}

export function getOAuthLoginTimeoutMs() {
	return OAUTH_LOGIN_TIMEOUT_MS;
}
