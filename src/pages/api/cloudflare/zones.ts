import type { APIRoute } from "astro";
import { listCloudflareZones } from "../../../lib/cloudflare/list-zones";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	let body: { token?: string };

	try {
		body = await request.json();
	} catch {
		return new Response(
			JSON.stringify({
				success: false,
				errorCode: "invalid_request",
				message: "Corpo da requisição inválido.",
				debug: { step: "parse_body", reason: "invalid_json" },
			}),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		);
	}

	const result = await listCloudflareZones(body.token ?? "");
	const status = result.success ? 200 : 401;

	return new Response(JSON.stringify(result), {
		status,
		headers: { "Content-Type": "application/json" },
	});
};
