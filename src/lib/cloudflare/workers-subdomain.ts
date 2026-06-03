import { cloudflareRequest } from "./api-client";

type WorkersSubdomainResult = { subdomain: string };

export async function getWorkersSubdomain(
	token: string,
	accountId: string,
): Promise<string> {
	const result = await cloudflareRequest<WorkersSubdomainResult>(
		token,
		`/accounts/${accountId}/workers/subdomain`,
		{ step: "get_workers_subdomain" },
	);

	if (!result.subdomain) {
		throw new Error(
			"Workers.dev subdomain not configured for this Cloudflare account.",
		);
	}

	return result.subdomain;
}

export async function enableWorkerSubdomain(input: {
	token: string;
	accountId: string;
	scriptName: string;
}): Promise<void> {
	await cloudflareRequest<{ enabled: boolean }>(
		input.token,
		`/accounts/${input.accountId}/workers/scripts/${input.scriptName}/subdomain`,
		{
			method: "POST",
			step: "enable_worker_subdomain",
			body: JSON.stringify({ enabled: true, previews_enabled: false }),
		},
	);
}
