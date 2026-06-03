import {
	CLOUDFLARE_AUTH_URL,
	CLOUDFLARE_OAUTH_CLIENT_ID,
	OAUTH_CALLBACK_URL,
} from "./constants";

type GenerateAuthUrlProps = {
	scopes: readonly string[];
	stateQueryParam: string;
	codeChallenge: string;
};

export function generateAuthUrl({
	scopes,
	stateQueryParam,
	codeChallenge,
}: GenerateAuthUrlProps): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: CLOUDFLARE_OAUTH_CLIENT_ID,
		redirect_uri: OAUTH_CALLBACK_URL,
		scope: [...scopes, "offline_access"].join(" "),
		state: stateQueryParam,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});

	return `${CLOUDFLARE_AUTH_URL}?${params.toString()}`;
}
