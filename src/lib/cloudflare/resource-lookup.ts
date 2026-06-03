import { cloudflareRequest } from "./api-client";

export type D1Database = { uuid: string; name: string };
export type KvNamespace = { id: string; title: string };
export type R2Bucket = { name: string; creation_date?: string };
export type WorkerScript = { id: string; tag?: string };

export async function findD1Database(
	token: string,
	accountId: string,
	name: string,
): Promise<D1Database | undefined> {
	const databases = await cloudflareRequest<D1Database[]>(
		token,
		`/accounts/${accountId}/d1/database`,
		{ step: "list_d1_databases" },
	);
	return databases.find((database) => database.name === name);
}

export async function findKvNamespace(
	token: string,
	accountId: string,
	title: string,
): Promise<KvNamespace | undefined> {
	const namespaces = await cloudflareRequest<KvNamespace[]>(
		token,
		`/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
		{ step: "list_kv_namespaces" },
	);
	return namespaces.find((namespace) => namespace.title === title);
}

export async function findR2Bucket(
	token: string,
	accountId: string,
	name: string,
): Promise<R2Bucket | undefined> {
	const response = await cloudflareRequest<{ buckets?: R2Bucket[] }>(
		token,
		`/accounts/${accountId}/r2/buckets`,
		{ step: "list_r2_buckets" },
	);
	return response.buckets?.find((bucket) => bucket.name === name);
}

export async function findWorkerScript(
	token: string,
	accountId: string,
	scriptName: string,
): Promise<WorkerScript | undefined> {
	const scripts = await cloudflareRequest<WorkerScript[]>(
		token,
		`/accounts/${accountId}/workers/scripts`,
		{ step: "list_worker_scripts" },
	);
	return scripts.find((script) => script.id === scriptName);
}

export type EvaluatedResource = {
	type: "d1" | "kv" | "r2" | "worker";
	label: string;
	name: string;
	binding?: string;
	exists: boolean;
	resourceId?: string;
};

export async function evaluateCloudflareResources(input: {
	token: string;
	accountId: string;
	d1Name: string;
	kvName: string;
	r2Name: string;
	workerName: string;
}): Promise<EvaluatedResource[]> {
	const [d1, kv, r2, worker] = await Promise.all([
		findD1Database(input.token, input.accountId, input.d1Name),
		findKvNamespace(input.token, input.accountId, input.kvName),
		findR2Bucket(input.token, input.accountId, input.r2Name),
		findWorkerScript(input.token, input.accountId, input.workerName),
	]);

	return [
		{
			type: "d1",
			label: "D1 Database",
			name: input.d1Name,
			binding: "DB",
			exists: Boolean(d1),
			resourceId: d1?.uuid,
		},
		{
			type: "kv",
			label: "KV Namespace",
			name: input.kvName,
			binding: "CACHE",
			exists: Boolean(kv),
			resourceId: kv?.id,
		},
		{
			type: "r2",
			label: "R2 Bucket",
			name: input.r2Name,
			binding: "MEDIA_BUCKET",
			exists: Boolean(r2),
			resourceId: r2?.name,
		},
		{
			type: "worker",
			label: "Worker",
			name: input.workerName,
			exists: Boolean(worker),
			resourceId: worker?.id,
		},
	];
}
