import { getPrimaryAccountId } from "./api-client";
import { evaluateCloudflareResources } from "./resource-lookup";
import { enrichEvaluatedResources } from "./resource-summary";
import { buildResourcePlan } from "../wizard/resources";
import type { WizardSetupConfig } from "../wizard/session";

export async function evaluateEdgePressResources(input: {
	token: string;
	config: WizardSetupConfig;
}) {
	const resourcePlan = buildResourcePlan(
		input.config.sitePrefix,
		input.config.siteName,
	);
	const d1 = resourcePlan.find((item) => item.type === "d1");
	const kv = resourcePlan.find((item) => item.type === "kv");
	const r2 = resourcePlan.find((item) => item.type === "r2");
	const worker = resourcePlan.find((item) => item.type === "worker");

	if (!d1 || !kv || !r2 || !worker) {
		return {
			success: false as const,
			errorCode: "invalid_request",
			message: "Plano de recursos inválido.",
		};
	}

	const accountId = await getPrimaryAccountId(input.token);
	const evaluated = await evaluateCloudflareResources({
		token: input.token,
		accountId,
		d1Name: d1.name,
		kvName: kv.name,
		r2Name: r2.name,
		workerName: worker.name,
	});

	return {
		success: true as const,
		accountId,
		resources: enrichEvaluatedResources(accountId, evaluated),
	};
}
