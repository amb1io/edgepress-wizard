import { cloudflareRequest } from "./api-client";
import { EDGPRESS_GITHUB } from "./constants";
import type { GitHubRepoInfo } from "./github-repo";

type BuildToken = { build_token_uuid: string; build_token_name?: string };
type RepoConnection = { repo_connection_uuid: string };
type BuildTrigger = { trigger_uuid: string };
type BuildRun = { build_uuid?: string; status?: string };

async function getBuildTokenUuid(
	token: string,
	accountId: string,
): Promise<string> {
	const tokens = await cloudflareRequest<BuildToken[]>(
		token,
		`/accounts/${accountId}/builds/tokens`,
		{ step: "list_build_tokens" },
	);

	const buildToken = tokens[0];
	if (!buildToken?.build_token_uuid) {
		throw new Error(
			"Nenhum build token encontrado. Crie um em Workers > Settings > Builds > API token no dashboard Cloudflare.",
		);
	}

	return buildToken.build_token_uuid;
}

async function upsertRepoConnection(
	token: string,
	accountId: string,
	repo: GitHubRepoInfo,
): Promise<string> {
	const connection = await cloudflareRequest<RepoConnection>(
		token,
		`/accounts/${accountId}/builds/repos/connections`,
		{
			method: "PUT",
			step: "upsert_repo_connection",
			body: JSON.stringify({
				provider_type: "github",
				provider_account_id: repo.ownerId,
				provider_account_name: repo.ownerName,
				repo_id: repo.repoId,
				repo_name: repo.repoName,
			}),
		},
	);

	if (!connection.repo_connection_uuid) {
		throw new Error("A API não retornou repo_connection_uuid.");
	}

	return connection.repo_connection_uuid;
}

async function findExistingTrigger(
	token: string,
	accountId: string,
	workerTag: string,
): Promise<BuildTrigger | undefined> {
	const triggers = await cloudflareRequest<BuildTrigger[]>(
		token,
		`/accounts/${accountId}/builds/workers/${workerTag}/triggers`,
		{ step: "list_build_triggers" },
	);
	return triggers[0];
}

async function createProductionTrigger(input: {
	token: string;
	accountId: string;
	workerTag: string;
	repoConnectionUuid: string;
	buildTokenUuid: string;
	branch: string;
}): Promise<string> {
	const existing = await findExistingTrigger(
		input.token,
		input.accountId,
		input.workerTag,
	);
	if (existing?.trigger_uuid) return existing.trigger_uuid;

	const trigger = await cloudflareRequest<BuildTrigger>(
		input.token,
		`/accounts/${input.accountId}/builds/triggers`,
		{
			method: "POST",
			step: "create_build_trigger",
			body: JSON.stringify({
				external_script_id: input.workerTag,
				repo_connection_uuid: input.repoConnectionUuid,
				build_token_uuid: input.buildTokenUuid,
				trigger_name: "EdgePress production",
				build_command: EDGPRESS_GITHUB.buildCommand,
				deploy_command: EDGPRESS_GITHUB.deployCommand,
				root_directory: "/",
				branch_includes: [input.branch],
				branch_excludes: [],
				path_includes: ["*"],
				path_excludes: [],
			}),
		},
	);

	if (!trigger.trigger_uuid) {
		throw new Error("A API não retornou trigger_uuid.");
	}

	return trigger.trigger_uuid;
}

async function triggerInitialBuild(input: {
	token: string;
	accountId: string;
	triggerUuid: string;
	branch: string;
}): Promise<BuildRun> {
	return cloudflareRequest<BuildRun>(
		input.token,
		`/accounts/${input.accountId}/builds/triggers/${input.triggerUuid}/builds`,
		{
			method: "POST",
			step: "trigger_initial_build",
			body: JSON.stringify({ branch: input.branch }),
		},
	);
}

export type WorkerBuildSetupResult = {
	repoConnectionUuid: string;
	buildTokenUuid: string;
	triggerUuid: string;
	buildUuid?: string;
	github: {
		owner: string;
		repo: string;
		branch: string;
	};
};

export async function setupWorkerGitHubBuilds(input: {
	token: string;
	accountId: string;
	workerTag: string;
	repo: GitHubRepoInfo;
}): Promise<WorkerBuildSetupResult> {
	const branch = EDGPRESS_GITHUB.branch || input.repo.defaultBranch;
	const buildTokenUuid = await getBuildTokenUuid(input.token, input.accountId);
	const repoConnectionUuid = await upsertRepoConnection(
		input.token,
		input.accountId,
		input.repo,
	);
	const triggerUuid = await createProductionTrigger({
		token: input.token,
		accountId: input.accountId,
		workerTag: input.workerTag,
		repoConnectionUuid,
		buildTokenUuid,
		branch,
	});
	const build = await triggerInitialBuild({
		token: input.token,
		accountId: input.accountId,
		triggerUuid,
		branch,
	});

	return {
		repoConnectionUuid,
		buildTokenUuid,
		triggerUuid,
		buildUuid: build.build_uuid,
		github: {
			owner: input.repo.ownerName,
			repo: input.repo.repoName,
			branch,
		},
	};
}
