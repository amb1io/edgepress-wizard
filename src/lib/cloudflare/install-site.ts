import {
	CloudflareApiError,
	getPrimaryAccountId,
} from "./api-client";
import { fetchGitHubRepoInfo } from "./github-repo";
import {
	provisionCloudflareResources,
	uploadWorkerWithBindings,
} from "./provision-resources";
import { setupWorkerGitHubBuilds } from "./setup-worker-builds";
import { buildInstallSummary, type ResourceSummaryItem } from "./resource-summary";
import { setBetterAuthSecret } from "./worker-secrets";
import {
	enableWorkerSubdomain,
	getWorkersSubdomain,
} from "./workers-subdomain";
import {
	completeEdgePressSetup,
	updateSiteUrlSetting,
	type EdgePressSetupResult,
} from "./complete-edgepress-setup";
import {
	WorkerBuildFailedError,
	waitForWorkerBuild,
} from "./poll-worker-build";
import { buildWranglerConfigForSite } from "./wrangler-config";
import { buildResourcePlan, buildImportQueueNames } from "../wizard/resources";
import type { WizardSetupConfig } from "../wizard/session";

export type InstallSiteResult = {
	success: boolean;
	errorCode?: string;
	message?: string;
	failedStep?: string;
	accountId?: string;
	resources?: ReturnType<typeof buildResourcePlan>;
	created?: {
		d1: { name: string; id: string; created: boolean };
		kv: { name: string; id: string; created: boolean };
		r2: { name: string; created: boolean };
		importQueue: { name: string; id: string; created: boolean };
		importDlq: { name: string; id: string; created: boolean };
		worker: { name: string; tag?: string; created: boolean };
	};
	wrangler?: {
		workerName: string;
		betterAuthUrl: string;
		trustedOrigins: string;
		workersDevUrl: string;
		customDomainUrl?: string;
		secretConfigured: boolean;
	};
	builds?: Awaited<ReturnType<typeof setupWorkerGitHubBuilds>>;
	setup?: EdgePressSetupResult;
	summary?: ResourceSummaryItem[];
	debug: Record<string, unknown>;
};

function createDebug(
	startedAt: string,
	steps: string[],
	extra: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		startedAt,
		steps,
		finishedAt: new Date().toISOString(),
		...extra,
	};
}

export async function installEdgePressSite(input: {
	token: string;
	config: WizardSetupConfig;
}): Promise<InstallSiteResult> {
	const startedAt = new Date().toISOString();
	const steps: string[] = [];
	const resourcePlan = buildResourcePlan(
		input.config.sitePrefix,
		input.config.siteName,
	);
	const d1 = resourcePlan.find((item) => item.type === "d1");
	const kv = resourcePlan.find((item) => item.type === "kv");
	const r2 = resourcePlan.find((item) => item.type === "r2");
	const worker = resourcePlan.find((item) => item.type === "worker");
	const queues = buildImportQueueNames(input.config.sitePrefix);

	if (!d1 || !kv || !r2 || !worker) {
		return {
			success: false,
			errorCode: "invalid_request",
			message: "Plano de recursos inválido.",
			debug: { step: "resource_plan", resourcePlan },
		};
	}

	try {
		steps.push("resolve_account");
		const accountId = await getPrimaryAccountId(input.token);

		steps.push("fetch_github_repo");
		const githubRepo = await fetchGitHubRepoInfo();

		steps.push("provision_resources");
		const created = await provisionCloudflareResources({
			token: input.token,
			accountId,
			d1Name: d1.name,
			kvName: kv.name,
			r2Name: r2.name,
			importQueueName: queues.importQueue,
			importDlqName: queues.importDlq,
			workerName: worker.name,
		});

		steps.push("upload_worker_bindings");
		const workerUpload = await uploadWorkerWithBindings({
			token: input.token,
			accountId,
			workerName: worker.name,
			d1Id: created.d1.id,
			kvNamespaceId: created.kv.id,
			r2BucketName: created.r2.name,
		});

		if (!workerUpload.tag) {
			const failedStep = "upload_worker_bindings";
			return {
				success: false,
				errorCode: "install_worker_tag_missing",
				message:
					"Worker criado, mas a tag necessária para Builds não foi encontrada.",
				failedStep,
				accountId,
				resources: resourcePlan,
				created: {
					...created,
					worker: {
						...created.worker,
						tag: workerUpload.tag,
						created: workerUpload.created,
					},
				},
				debug: createDebug(startedAt, steps, {
					failedStep,
					workerUpload,
				}),
			};
		}

		steps.push("resolve_workers_subdomain");
		const workersSubdomain = await getWorkersSubdomain(input.token, accountId);

		steps.push("build_wrangler_config");
		const wranglerConfig = buildWranglerConfigForSite({
			config: input.config,
			apiToken: input.token,
			bindings: {
				d1: created.d1,
				kv: created.kv,
				r2: created.r2,
				importQueue: created.importQueue,
				importDlq: created.importDlq,
			},
			workersSubdomain,
		});

		steps.push("set_better_auth_secret");
		await setBetterAuthSecret({
			token: input.token,
			accountId,
			scriptName: worker.name,
		});

		steps.push("enable_worker_subdomain");
		await enableWorkerSubdomain({
			token: input.token,
			accountId,
			scriptName: worker.name,
		});

		steps.push("setup_github_builds");
		const builds = await setupWorkerGitHubBuilds({
			token: input.token,
			accountId,
			workerTag: workerUpload.tag,
			repo: githubRepo,
			buildCommand: wranglerConfig.buildCommand,
			deployCommand: wranglerConfig.deployCommand,
			buildEnvironment: wranglerConfig.buildEnvironment,
		});

		let setup: EdgePressSetupResult | undefined;
		if (builds.buildUuid) {
			steps.push("wait_worker_build");
			await waitForWorkerBuild({
				token: input.token,
				accountId,
				buildUuid: builds.buildUuid,
			});

			// Brief pause so the deployed worker is reachable on workers.dev.
			await new Promise((resolve) => setTimeout(resolve, 5_000));

			steps.push("complete_edgepress_setup");
			setup = await completeEdgePressSetup({
				workerBaseUrl: wranglerConfig.auth.workersDevUrl,
				config: input.config,
			});

			if (wranglerConfig.auth.customDomainUrl) {
				steps.push("update_site_url_setting");
				await updateSiteUrlSetting({
					token: input.token,
					accountId,
					d1DatabaseId: created.d1.id,
					siteUrl: wranglerConfig.auth.customDomainUrl,
				});
				setup = { ...setup, siteUrlUpdated: true };
			}
		}

		steps.push("install_completed");
		const summary = buildInstallSummary({
			accountId,
			workerName: worker.name,
			created: {
				...created,
				worker: {
					...created.worker,
					tag: workerUpload.tag,
					created: workerUpload.created,
					existed: workerUpload.existed,
				},
			},
			workerCreated: workerUpload.created,
			builds,
		});

		const wrangler = {
			workerName: wranglerConfig.workerName,
			betterAuthUrl: wranglerConfig.auth.betterAuthUrl,
			trustedOrigins: wranglerConfig.auth.trustedOrigins,
			workersDevUrl: wranglerConfig.auth.workersDevUrl,
			customDomainUrl: wranglerConfig.auth.customDomainUrl,
			secretConfigured: true,
		};

		return {
			success: true,
			accountId,
			resources: resourcePlan,
			created: {
				...created,
				worker: {
					...created.worker,
					tag: workerUpload.tag,
					created: workerUpload.created,
				},
			},
			wrangler,
			builds,
			setup,
			summary,
			debug: createDebug(startedAt, steps, {
				accountId,
				githubRepo,
				summary,
				wrangler,
				setup,
				buildCommandLength: wranglerConfig.buildCommand.length,
				wranglerTomlBytes: Buffer.byteLength(wranglerConfig.wranglerToml, "utf8"),
			}),
		};
	} catch (error) {
		const failedStep = error instanceof CloudflareApiError ? error.step : "install_site";

		const debug = createDebug(startedAt, steps, {
			failedStep,
		});

		if (error instanceof CloudflareApiError) {
			debug.cloudflare = {
				step: error.step,
				status: error.status,
				body: error.body,
			};
			const result: InstallSiteResult = {
				success: false,
				errorCode: mapCloudflareErrorCode(error),
				message: error.message,
				failedStep: error.step,
				debug,
			};
			return result;
		}

		debug.error =
			error instanceof Error
				? {
						name: error.name,
						message: error.message,
						stack: error.stack,
					}
				: error;

		if (error instanceof WorkerBuildFailedError) {
			debug.buildLogs = error.buildLogs;
		}

		return {
			success: false,
			errorCode: mapGenericInstallErrorCode(error),
			message:
				error instanceof Error
					? error.message
					: "Falha ao instalar recursos no Cloudflare.",
			failedStep,
			debug,
		};
	}
}

function mapCloudflareErrorCode(error: CloudflareApiError): string {
	if (error.step.includes("create_import_queue") || error.step.includes("create_import_dlq") || error.step.includes("verify_queues_plan")) {
		return "install_queues_unavailable";
	}
	if (error.step.includes("repo_connection")) {
		return "install_github_not_connected";
	}
	if (
		error.step.includes("build_trigger") ||
		error.step.includes("build_tokens") ||
		error.step.includes("build_trigger_env")
	) {
		return "install_build_setup_failed";
	}
	if (error.step.includes("put_worker_secret")) {
		return "install_secret_failed";
	}
	if (
		error.step.includes("workers_subdomain") ||
		error.step.includes("worker_subdomain")
	) {
		return "install_subdomain_failed";
	}
	if (error.step.includes("get_build_status")) {
		return "install_build_failed";
	}
	if (
		error.step.includes("update_site_url_setting") ||
		error.step.includes("d1/database")
	) {
		return "install_setup_seed_failed";
	}
	return "install_failed";
}

function mapGenericInstallErrorCode(error: unknown): string {
	if (!(error instanceof Error)) return "install_failed";

	if (error.message.includes("build token")) {
		return "install_build_token_missing";
	}
	if (error.message.includes("GitHub")) {
		return "install_github_error";
	}
	if (error.message.includes("Worker build")) {
		return "install_build_failed";
	}
	if (
		error.message.includes("EdgePress setup") ||
		error.message.includes("admin user") ||
		error.message.includes("Email is already")
	) {
		return "install_setup_failed";
	}
	return "install_failed";
}
