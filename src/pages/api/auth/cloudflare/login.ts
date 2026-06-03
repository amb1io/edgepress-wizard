import type { APIRoute } from "astro";
import { generateAuthUrl } from "../../../../lib/cloudflare/oauth/generate-auth-url";
import {
	generatePKCECodes,
	generateRandomState,
} from "../../../../lib/cloudflare/oauth/pkce";
import { ensureOAuthCallbackServer } from "../../../../lib/cloudflare/oauth/callback-server";
import { createPendingOAuthFlow } from "../../../../lib/cloudflare/oauth/session-store";
import { EDGEPRESS_WIZARD_OAUTH_SCOPES } from "../../../../lib/cloudflare/oauth/scopes";

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect }) => {
	const wizardOrigin = new URL(request.url).origin;

	try {
		await ensureOAuthCallbackServer();
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Não foi possível iniciar o servidor OAuth local.";
		return redirect(`/setup/1?error=oauth_server_unavailable&detail=${encodeURIComponent(message)}`);
	}

	const { codeChallenge, codeVerifier } = await generatePKCECodes();
	const stateQueryParam = generateRandomState();

	createPendingOAuthFlow({
		stateQueryParam,
		codeVerifier,
		wizardOrigin,
	});

	const authUrl = generateAuthUrl({
		scopes: EDGEPRESS_WIZARD_OAUTH_SCOPES,
		stateQueryParam,
		codeChallenge,
	});

	return redirect(authUrl);
};
