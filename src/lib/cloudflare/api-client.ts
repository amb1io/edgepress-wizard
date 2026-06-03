import { CLOUDFLARE_API_BASE } from "./constants";

type CloudflareEnvelope<T> = {
	success: boolean;
	errors?: Array<{ code?: number; message?: string }>;
	messages?: string[];
	result?: T;
};

export class CloudflareApiError extends Error {
	status: number;
	step: string;
	body: unknown;

	constructor(
		message: string,
		options: { status: number; step: string; body: unknown },
	) {
		super(message);
		this.name = "CloudflareApiError";
		this.status = options.status;
		this.step = options.step;
		this.body = options.body;
	}
}

export async function cloudflareRequest<T>(
	token: string,
	path: string,
	options: RequestInit & { step: string } = { step: "cloudflare_request" },
): Promise<T> {
	const { step, ...fetchOptions } = options;
	const headers = new Headers(fetchOptions.headers);
	if (!headers.has("Authorization")) {
		headers.set("Authorization", `Bearer ${token}`);
	}
	if (
		fetchOptions.body &&
		typeof fetchOptions.body === "string" &&
		!headers.has("Content-Type")
	) {
		headers.set("Content-Type", "application/json");
	}

	const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
		...fetchOptions,
		headers,
	});

	let body: CloudflareEnvelope<T> | unknown;
	try {
		body = (await response.json()) as CloudflareEnvelope<T>;
	} catch {
		body = { parseError: true, status: response.status };
	}

	const envelope = body as CloudflareEnvelope<T>;
	if (!response.ok || envelope.success === false) {
		const message =
			envelope.errors?.[0]?.message ??
			`Erro na API Cloudflare (${response.status}).`;
		throw new CloudflareApiError(message, {
			status: response.status,
			step,
			body,
		});
	}

	return envelope.result as T;
}

export async function getPrimaryAccountId(token: string): Promise<string> {
	const accounts = await cloudflareRequest<Array<{ id: string; name?: string }>>(
		token,
		"/accounts?per_page=50",
		{ step: "list_accounts" },
	);

	if (!accounts.length) {
		throw new CloudflareApiError(
			"Nenhuma conta Cloudflare encontrada para este token.",
			{ status: 404, step: "list_accounts", body: { accounts } },
		);
	}

	return accounts[0].id;
}
