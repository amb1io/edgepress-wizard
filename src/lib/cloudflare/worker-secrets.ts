import { cloudflareRequest } from "./api-client";

function randomBase64Secret(byteLength: number): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

export function generateBetterAuthSecret(): string {
	return randomBase64Secret(32);
}

export async function putWorkerSecret(input: {
	token: string;
	accountId: string;
	scriptName: string;
	secretName: string;
	secretValue: string;
}): Promise<void> {
	await cloudflareRequest<unknown>(
		input.token,
		`/accounts/${input.accountId}/workers/scripts/${input.scriptName}/secrets`,
		{
			method: "PUT",
			step: "put_worker_secret",
			body: JSON.stringify({
				name: input.secretName,
				text: input.secretValue,
				type: "secret_text",
			}),
		},
	);
}

export async function setBetterAuthSecret(input: {
	token: string;
	accountId: string;
	scriptName: string;
}): Promise<{ secretName: string; generated: true }> {
	const secretValue = generateBetterAuthSecret();

	await putWorkerSecret({
		...input,
		secretName: "BETTER_AUTH_SECRET",
		secretValue,
	});

	return { secretName: "BETTER_AUTH_SECRET", generated: true };
}
