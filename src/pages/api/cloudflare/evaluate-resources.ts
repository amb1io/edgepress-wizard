import type { APIRoute } from "astro";
import { evaluateEdgePressResources } from "../../../lib/cloudflare/evaluate-resources";
import type { WizardSetupConfig } from "../../../lib/wizard/session";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { token?: string; config?: WizardSetupConfig };

	try {
		body = await request.json();
	} catch {
		return jsonResponse(
			{
				success: false,
				errorCode: "invalid_request",
				message: "Corpo da requisição inválido.",
			},
			400,
		);
	}

	if (!body.token || !body.config) {
		return jsonResponse(
			{
				success: false,
				errorCode: "invalid_request",
				message: "Token ou configuração ausentes.",
			},
			400,
		);
	}

	try {
		const result = await evaluateEdgePressResources({
			token: body.token,
			config: body.config,
		});

		if (!result.success) {
			const status =
				result.errorCode === "install_queues_unavailable" ? 403 : 400;
			return jsonResponse(result, status);
		}

		return jsonResponse(result, 200);
	} catch (error) {
		console.error(
			"[EdgePress Wizard][evaluate-resources] failed",
			error instanceof Error ? error.message : error,
		);
		return jsonResponse(
			{
				success: false,
				errorCode: "evaluate_failed",
				message:
					error instanceof Error
						? error.message
						: "Falha ao avaliar recursos no Cloudflare.",
			},
			500,
		);
	}
};

function jsonResponse(body: unknown, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
