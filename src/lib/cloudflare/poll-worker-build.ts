import { cloudflareRequest } from "./api-client";

export type WorkerBuildStatus = {
	build_uuid?: string;
	build_outcome?: "success" | "fail" | "skipped" | "cancelled" | "terminated";
	status?: "queued" | "initializing" | "running" | "stopped";
};

export class WorkerBuildFailedError extends Error {
	outcome: string;
	buildLogs: string;

	constructor(outcome: string, buildLogs: string) {
		const logSnippet = buildLogs
			? `\n\nÚltimas linhas do log do build:\n${buildLogs}`
			: "";
		super(`Worker build finished with outcome: ${outcome}.${logSnippet}`);
		this.name = "WorkerBuildFailedError";
		this.outcome = outcome;
		this.buildLogs = buildLogs;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLogLines(
	lines: Array<number | string>[] | undefined,
): string {
	if (!lines?.length) return "";

	return lines
		.map((line) => {
			if (!Array.isArray(line) || line.length === 0) return "";
			const message = line[line.length - 1];
			return typeof message === "string" ? message : String(message);
		})
		.filter(Boolean)
		.slice(-50)
		.join("\n");
}

export async function fetchWorkerBuildLogs(input: {
	token: string;
	accountId: string;
	buildUuid: string;
}): Promise<string> {
	const allLines: string[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < 5; page += 1) {
		const query = cursor
			? `?cursor=${encodeURIComponent(cursor)}`
			: "";
		const result = await cloudflareRequest<{
			lines?: Array<number | string>[];
			cursor?: string;
			truncated?: boolean;
		}>(
			input.token,
			`/accounts/${input.accountId}/builds/builds/${input.buildUuid}/logs${query}`,
			{ step: "get_build_logs" },
		);

		const pageLines = formatLogLines(result.lines);
		if (pageLines) allLines.push(pageLines);

		if (!result.truncated || !result.cursor) break;
		cursor = result.cursor;
	}

	const combined = allLines.join("\n");
	const errorLines = combined
		.split("\n")
		.filter((line) => /error|✘|failed|FAIL/i.test(line));

	if (errorLines.length > 0) {
		return [...errorLines, "", "---", combined.split("\n").slice(-30).join("\n")].join(
			"\n",
		);
	}

	return combined.split("\n").slice(-80).join("\n");
}

export async function waitForWorkerBuild(input: {
	token: string;
	accountId: string;
	buildUuid: string;
	timeoutMs?: number;
	pollIntervalMs?: number;
}): Promise<WorkerBuildStatus> {
	const timeoutMs = input.timeoutMs ?? 20 * 60 * 1000;
	const pollIntervalMs = input.pollIntervalMs ?? 10_000;
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const build = await cloudflareRequest<WorkerBuildStatus>(
			input.token,
			`/accounts/${input.accountId}/builds/builds/${input.buildUuid}`,
			{ step: "get_build_status" },
		);

		if (build.build_outcome === "success") {
			return build;
		}

		if (
			build.build_outcome === "fail" ||
			build.build_outcome === "cancelled" ||
			build.build_outcome === "terminated"
		) {
			let buildLogs = "";
			try {
				buildLogs = await fetchWorkerBuildLogs({
					token: input.token,
					accountId: input.accountId,
					buildUuid: input.buildUuid,
				});
			} catch {
				buildLogs = "";
			}

			throw new WorkerBuildFailedError(build.build_outcome, buildLogs);
		}

		await sleep(pollIntervalMs);
	}

	throw new Error("Worker build timed out while waiting for deployment.");
}
