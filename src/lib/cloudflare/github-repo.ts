import { EDGPRESS_GITHUB } from "./constants";

type GitHubRepoResponse = {
	id: number;
	name: string;
	full_name: string;
	owner: {
		id: number;
		login: string;
	};
	default_branch: string;
};

export type GitHubRepoInfo = {
	ownerId: string;
	ownerName: string;
	repoId: string;
	repoName: string;
	defaultBranch: string;
};

export async function fetchGitHubRepoInfo(): Promise<GitHubRepoInfo> {
	const response = await fetch(
		`https://api.github.com/repos/${EDGPRESS_GITHUB.owner}/${EDGPRESS_GITHUB.repo}`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "edgepress-wizard",
			},
		},
	);

	const body = (await response.json()) as GitHubRepoResponse & {
		message?: string;
	};

	if (!response.ok) {
		throw new Error(
			body.message ??
				`Não foi possível obter dados do repositório GitHub (${response.status}).`,
		);
	}

	return {
		ownerId: String(body.owner.id),
		ownerName: body.owner.login,
		repoId: String(body.id),
		repoName: body.name,
		defaultBranch: body.default_branch || EDGPRESS_GITHUB.branch,
	};
}
