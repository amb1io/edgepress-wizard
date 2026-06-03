const CLOUDFLARE_ZONES_URL = "https://api.cloudflare.com/client/v4/zones";

export type CloudflareZone = {
	id: string;
	name: string;
	status: string;
};

export type ListCloudflareZonesResult = {
	success: boolean;
	zones: CloudflareZone[];
	errorCode?: string;
	message?: string;
	debug: Record<string, unknown>;
};

type ZonesApiResponse = {
	success?: boolean;
	errors?: Array<{ message?: string }>;
	result?: Array<{
		id?: string;
		name?: string;
		status?: string;
	}>;
	result_info?: {
		page?: number;
		total_pages?: number;
	};
};

export async function listCloudflareZones(
	token: string,
): Promise<ListCloudflareZonesResult> {
	const trimmedToken = token.trim();

	if (!trimmedToken) {
		return {
			success: false,
			zones: [],
			errorCode: "missing_token",
			message: "Token vazio.",
			debug: { step: "input_validation", reason: "empty_token" },
		};
	}

	const startedAt = new Date().toISOString();
	const zones: CloudflareZone[] = [];
	const requests: Array<Record<string, unknown>> = [];
	let page = 1;
	let totalPages = 1;

	try {
		while (page <= totalPages) {
			const url = new URL(CLOUDFLARE_ZONES_URL);
			url.searchParams.set("per_page", "50");
			url.searchParams.set("page", String(page));

			const response = await fetch(url, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${trimmedToken}`,
					"Content-Type": "application/json",
				},
			});

			const body = (await response.json()) as ZonesApiResponse;
			requests.push({
				page,
				status: response.status,
				ok: response.ok,
				count: body.result?.length ?? 0,
			});

			if (!response.ok || !body.success) {
				return {
					success: false,
					zones: [],
					errorCode: "domains_load_failed",
					message:
						body.errors?.[0]?.message ??
						"Não foi possível listar os domínios da conta Cloudflare.",
					debug: {
						step: "list_zones",
						startedAt,
						requests,
						response: {
							status: response.status,
							body,
						},
					},
				};
			}

			for (const zone of body.result ?? []) {
				if (zone.id && zone.name) {
					zones.push({
						id: zone.id,
						name: zone.name,
						status: zone.status ?? "unknown",
					});
				}
			}

			totalPages = body.result_info?.total_pages ?? 1;
			page += 1;
		}

		zones.sort((a, b) => a.name.localeCompare(b.name));

		return {
			success: true,
			zones,
			debug: {
				step: "list_zones",
				startedAt,
				requests,
				totalZones: zones.length,
			},
		};
	} catch (error) {
		return {
			success: false,
			zones: [],
			errorCode: "network_error",
			message:
				error instanceof Error
					? error.message
					: "Erro desconhecido ao listar domínios.",
			debug: {
				step: "list_zones",
				startedAt,
				requests,
				error:
					error instanceof Error
						? {
								name: error.name,
								message: error.message,
								stack: error.stack,
							}
						: error,
			},
		};
	}
}
