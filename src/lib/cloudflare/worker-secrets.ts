import { randomBytes } from "node:crypto";
import { cloudflareRequest } from "./api-client";

export function generateBetterAuthSecret(): string {
	return randomBytes(32).toString("base64");
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
