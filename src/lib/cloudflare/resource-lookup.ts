import { CloudflareApiError, cloudflareRequest } from "./api-client";

export type D1Database = { uuid: string; name: string };
export type KvNamespace = { id: string; title: string };
export type R2Bucket = { name: string; creation_date?: string };
export type WorkerScript = { id: string; tag?: string };
export type CloudflareQueue = { queue_id: string; queue_name: string };

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

export async function findQueue(
	token: string,
	accountId: string,
	queueName: string,
): Promise<CloudflareQueue | undefined> {
	const queues = await cloudflareRequest<CloudflareQueue[]>(
		token,
		`/accounts/${accountId}/queues`,
		{ step: "list_queues" },
	);
	return queues.find((queue) => queue.queue_name === queueName);
}

export async function assertQueuesAvailable(
	token: string,
	accountId: string,
): Promise<void> {
	try {
		await cloudflareRequest<CloudflareQueue[]>(
			token,
			`/accounts/${accountId}/queues`,
			{ step: "verify_queues_plan" },
		);
	} catch (error) {
		if (error instanceof CloudflareApiError) {
			const envelope = error.body as {
				errors?: Array<{ code?: number; message?: string }>;
			};
			const code = envelope.errors?.[0]?.code;
			if (code === 100129) {
				throw new CloudflareApiError(
					"Cloudflare Queues exigem o plano Workers Paid. Atualize sua conta antes de instalar.",
					{ status: error.status, step: "verify_queues_plan", body: error.body },
				);
			}
		}
		throw error;
	}
}

export type EvaluatedResource = {
	type: "d1" | "kv" | "r2" | "queue" | "worker";
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
	importQueueName: string;
	importDlqName: string;
	workerName: string;
}): Promise<EvaluatedResource[]> {
	await assertQueuesAvailable(input.token, input.accountId);

	const [d1, kv, r2, importQueue, importDlq, worker] = await Promise.all([
		findD1Database(input.token, input.accountId, input.d1Name),
		findKvNamespace(input.token, input.accountId, input.kvName),
		findR2Bucket(input.token, input.accountId, input.r2Name),
		findQueue(input.token, input.accountId, input.importQueueName),
		findQueue(input.token, input.accountId, input.importDlqName),
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
			type: "queue",
			label: "Import Queue",
			name: input.importQueueName,
			binding: "IMPORT_QUEUE",
			exists: Boolean(importQueue),
			resourceId: importQueue?.queue_id,
		},
		{
			type: "queue",
			label: "Import DLQ",
			name: input.importDlqName,
			exists: Boolean(importDlq),
			resourceId: importDlq?.queue_id,
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
