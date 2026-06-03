import type { APIRoute } from "astro";
import { installEdgePressSite } from "../../../lib/cloudflare/install-site";
import type { WizardSetupConfig } from "../../../lib/wizard/session";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { token?: string; config?: WizardSetupConfig };

	try {
		body = await request.json();
	} catch {
		const result = {
			success: false,
			errorCode: "invalid_request",
			message: "Corpo da requisição inválido.",
			failedStep: "parse_body",
			debug: { step: "parse_body", reason: "invalid_json" },
		};
		console.error("[EdgePress Wizard][install] invalid JSON body", result);
		return jsonResponse(result, 400);
	}

	if (!body.token || !body.config) {
		const result = {
			success: false,
			errorCode: "invalid_request",
			message: "Token ou configuração ausentes.",
			failedStep: "validate_body",
			debug: { step: "validate_body", reason: "missing_fields" },
		};
		console.error("[EdgePress Wizard][install] missing token or config", result);
		return jsonResponse(result, 400);
	}

	const result = await installEdgePressSite({
		token: body.token,
		config: body.config,
	});

	if (!result.success) {
		console.error(
			"[EdgePress Wizard][install] failed",
			JSON.stringify(
				{
					errorCode: result.errorCode,
					message: result.message,
					failedStep: result.failedStep,
					accountId: result.accountId,
					debug: result.debug,
				},
				null,
				2,
			),
		);
		return jsonResponse(result, 500);
	}

	console.info(
		"[EdgePress Wizard][install] success",
		JSON.stringify(
			{
				accountId: result.accountId,
				created: result.created,
				builds: result.builds,
			},
			null,
			2,
		),
	);

	return jsonResponse(result, 200);
};

function jsonResponse(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
