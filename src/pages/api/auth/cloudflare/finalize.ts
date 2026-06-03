import type { APIRoute } from "astro";
import { validateCloudflareToken } from "../../../../lib/cloudflare/validate-token";
import { consumeCompletedOAuthSession } from "../../../../lib/cloudflare/oauth/session-store";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { sessionId?: string };

	try {
		body = await request.json();
	} catch {
		return new Response(
			JSON.stringify({
				success: false,
				errorCode: "invalid_request",
				message: "Corpo da requisição inválido.",
				debug: { step: "parse_body", reason: "invalid_json" },
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const session = body.sessionId
		? consumeCompletedOAuthSession(body.sessionId)
		: undefined;

	if (!session) {
		return new Response(
			JSON.stringify({
				success: false,
				errorCode: "oauth_session_expired",
				message: "Sessão OAuth expirada ou inválida. Faça login novamente.",
				debug: { step: "finalize", reason: "missing_session" },
			}),
			{ status: 401, headers: { "Content-Type": "application/json" } },
		);
	}

	const validation = await validateCloudflareToken(session.accessToken);
	if (!validation.success) {
		return new Response(
			JSON.stringify({
				success: false,
				errorCode: validation.errorCode ?? "invalid_token",
				message: validation.message,
				debug: validation.debug,
			}),
			{ status: 401, headers: { "Content-Type": "application/json" } },
		);
	}

	return new Response(
		JSON.stringify({
			success: true,
			token: session.accessToken,
			expiresAt: session.expiresAt,
			scopes: session.scopes,
			debug: validation.debug,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
};
