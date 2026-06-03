import { webcrypto as crypto } from "node:crypto";
import { TextEncoder } from "node:util";

export const RECOMMENDED_CODE_VERIFIER_LENGTH = 96;
export const RECOMMENDED_STATE_LENGTH = 32;

const PKCE_CHARSET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export type PKCECodes = {
	codeChallenge: string;
	codeVerifier: string;
};

function base64urlEncode(value: string): string {
	return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function generatePKCECodes(): Promise<PKCECodes> {
	const output = new Uint32Array(RECOMMENDED_CODE_VERIFIER_LENGTH);
	crypto.getRandomValues(output);
	const codeVerifier = base64urlEncode(
		Array.from(output)
			.map((num) => PKCE_CHARSET[num % PKCE_CHARSET.length])
			.join(""),
	);
	const buffer = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(codeVerifier),
	);
	const hash = new Uint8Array(buffer);
	const binary = Array.from(hash, (byte) => String.fromCharCode(byte)).join("");
	return { codeChallenge: base64urlEncode(binary), codeVerifier };
}

export function generateRandomState(length = RECOMMENDED_STATE_LENGTH): string {
	const output = new Uint32Array(length);
	crypto.getRandomValues(output);
	return Array.from(output)
		.map((num) => PKCE_CHARSET[num % PKCE_CHARSET.length])
		.join("");
}
