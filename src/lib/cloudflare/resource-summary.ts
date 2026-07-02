import {
	d1DatabaseUrl,
	kvNamespaceUrl,
	r2BucketUrl,
	workerBuildsUrl,
	workerServiceUrl,
} from "./dashboard-urls";
import type { CreatedResources } from "./provision-resources";
import type { WorkerBuildSetupResult } from "./setup-worker-builds";
import type { EvaluatedResource } from "./resource-lookup";

export type ResourceSummaryItem = {
	type: "d1" | "kv" | "r2" | "queue" | "worker" | "builds";
	label: string;
	name: string;
	binding?: string;
	status: "created" | "existing" | "updated";
	statusLabel: string;
	url: string;
	resourceId?: string;
};

const STATUS_LABELS: Record<ResourceSummaryItem["status"], string> = {
	created: "Criado",
	existing: "Já existia",
	updated: "Atualizado",
};

export function dashboardUrlForResource(
	accountId: string,
	resource: Pick<EvaluatedResource, "type" | "name" | "resourceId">,
): string | undefined {
	if (!resource.resourceId) return undefined;

	switch (resource.type) {
		case "d1":
			return d1DatabaseUrl(accountId, resource.resourceId);
		case "kv":
			return kvNamespaceUrl(accountId, resource.resourceId);
		case "r2":
			return r2BucketUrl(accountId, resource.name);
		case "worker":
			return workerServiceUrl(accountId, resource.name);
	}
}

export function enrichEvaluatedResources(
	accountId: string,
	resources: EvaluatedResource[],
): Array<EvaluatedResource & { url?: string }> {
	return resources.map((resource) => ({
		...resource,
		url: resource.exists
			? dashboardUrlForResource(accountId, resource)
			: undefined,
	}));
}

export function buildInstallSummary(input: {
	accountId: string;
	workerName: string;
	created: CreatedResources;
	workerCreated: boolean;
	builds?: WorkerBuildSetupResult;
}): ResourceSummaryItem[] {
	const { accountId, workerName, created, workerCreated, builds } = input;

	const items: ResourceSummaryItem[] = [
		{
			type: "d1",
			label: "D1 Database",
			name: created.d1.name,
			binding: "DB",
			status: created.d1.created ? "created" : "existing",
			statusLabel: created.d1.created
				? STATUS_LABELS.created
				: STATUS_LABELS.existing,
			url: d1DatabaseUrl(accountId, created.d1.id),
			resourceId: created.d1.id,
		},
		{
			type: "kv",
			label: "KV Namespace",
			name: created.kv.name,
			binding: "CACHE",
			status: created.kv.created ? "created" : "existing",
			statusLabel: created.kv.created
				? STATUS_LABELS.created
				: STATUS_LABELS.existing,
			url: kvNamespaceUrl(accountId, created.kv.id),
			resourceId: created.kv.id,
		},
		{
			type: "r2",
			label: "R2 Bucket",
			name: created.r2.name,
			binding: "MEDIA_BUCKET",
			status: created.r2.created ? "created" : "existing",
			statusLabel: created.r2.created
				? STATUS_LABELS.created
				: STATUS_LABELS.existing,
			url: r2BucketUrl(accountId, created.r2.name),
			resourceId: created.r2.name,
		},
		{
			type: "queue",
			label: "Import Queue",
			name: created.importQueue.name,
			binding: "IMPORT_QUEUE",
			status: created.importQueue.created ? "created" : "existing",
			statusLabel: created.importQueue.created
				? STATUS_LABELS.created
				: STATUS_LABELS.existing,
			url: workerServiceUrl(accountId, workerName),
			resourceId: created.importQueue.id,
		},
		{
			type: "queue",
			label: "Import DLQ",
			name: created.importDlq.name,
			status: created.importDlq.created ? "created" : "existing",
			statusLabel: created.importDlq.created
				? STATUS_LABELS.created
				: STATUS_LABELS.existing,
			url: workerServiceUrl(accountId, workerName),
			resourceId: created.importDlq.id,
		},
		{
			type: "worker",
			label: "Worker",
			name: created.worker.name,
			status: workerCreated ? "created" : "updated",
			statusLabel: workerCreated
				? STATUS_LABELS.created
				: STATUS_LABELS.updated,
			url: workerServiceUrl(accountId, workerName),
			resourceId: created.worker.name,
		},
	];

	if (builds) {
		items.push({
			type: "builds",
			label: "GitHub Builds",
			name: `${builds.github.owner}/${builds.github.repo}@${builds.github.branch}`,
			status: "updated",
			statusLabel: builds.buildUuid ? "Build disparado" : "Configurado",
			url: workerBuildsUrl(accountId, workerName),
		});
	}

	return items;
}
