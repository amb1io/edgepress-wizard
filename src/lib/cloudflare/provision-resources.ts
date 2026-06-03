import { CloudflareApiError, cloudflareRequest } from "./api-client";
import {
	findD1Database,
	findKvNamespace,
	findR2Bucket,
	findWorkerScript,
} from "./resource-lookup";

type WorkerScript = { id: string; tag?: string };

export type CreatedResources = {
	d1: { name: string; id: string; created: boolean; existed: boolean };
	kv: { name: string; id: string; created: boolean; existed: boolean };
	r2: { name: string; created: boolean; existed: boolean };
	worker: { name: string; tag?: string; created: boolean; existed: boolean };
};

export async function provisionCloudflareResources(input: {
	token: string;
	accountId: string;
	d1Name: string;
	kvName: string;
	r2Name: string;
	workerName: string;
}): Promise<CreatedResources> {
	const { token, accountId, d1Name, kvName, r2Name, workerName } = input;

	let d1 = await findD1Database(token, accountId, d1Name);
	const d1Existed = Boolean(d1);
	if (!d1) {
		d1 = await cloudflareRequest<{ uuid: string; name: string }>(
			token,
			`/accounts/${accountId}/d1/database`,
			{
				method: "POST",
				step: "create_d1_database",
				body: JSON.stringify({ name: d1Name }),
			},
		);
	}

	let kv = await findKvNamespace(token, accountId, kvName);
	const kvExisted = Boolean(kv);
	if (!kv) {
		kv = await cloudflareRequest<{ id: string; title: string }>(
			token,
			`/accounts/${accountId}/storage/kv/namespaces`,
			{
				method: "POST",
				step: "create_kv_namespace",
				body: JSON.stringify({ title: kvName }),
			},
		);
	}

	let r2 = await findR2Bucket(token, accountId, r2Name);
	const r2Existed = Boolean(r2);
	if (!r2) {
		r2 = await cloudflareRequest<{ name: string }>(
			token,
			`/accounts/${accountId}/r2/buckets`,
			{
				method: "POST",
				step: "create_r2_bucket",
				body: JSON.stringify({ name: r2Name }),
			},
		);
	}

	const worker = await findWorkerScript(token, accountId, workerName);
	const workerExisted = Boolean(worker);

	return {
		d1: {
			name: d1Name,
			id: d1.uuid,
			created: !d1Existed,
			existed: d1Existed,
		},
		kv: {
			name: kvName,
			id: kv.id,
			created: !kvExisted,
			existed: kvExisted,
		},
		r2: {
			name: r2Name,
			created: !r2Existed,
			existed: r2Existed,
		},
		worker: {
			name: workerName,
			tag: worker?.tag,
			created: false,
			existed: workerExisted,
		},
	};
}

export async function uploadWorkerWithBindings(input: {
	token: string;
	accountId: string;
	workerName: string;
	d1Id: string;
	kvNamespaceId: string;
	r2BucketName: string;
}): Promise<{ tag: string; created: boolean; existed: boolean }> {
	const existing = await findWorkerScript(
		input.token,
		input.accountId,
		input.workerName,
	);

	const metadata = {
		main_module: "worker.mjs",
		compatibility_date: "2024-09-23",
		compatibility_flags: ["nodejs_compat"],
		bindings: [
			{ type: "d1", name: "DB", id: input.d1Id },
			{
				type: "kv_namespace",
				name: "CACHE",
				namespace_id: input.kvNamespaceId,
			},
			{
				type: "r2_bucket",
				name: "MEDIA_BUCKET",
				bucket_name: input.r2BucketName,
			},
		],
	};

	const workerSource = `export default {
  async fetch() {
    return new Response(
      "EdgePress Worker provisionado. Aguardando deploy via GitHub Builds.",
      { status: 200 },
    );
  },
};
`;

	const form = new FormData();
	form.append("metadata", JSON.stringify(metadata));
	form.append(
		"worker.mjs",
		new Blob([workerSource], { type: "application/javascript+module" }),
		"worker.mjs",
	);

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/workers/scripts/${input.workerName}`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${input.token}`,
			},
			body: form,
		},
	);

	const body = (await response.json()) as {
		success?: boolean;
		errors?: Array<{ message?: string }>;
		result?: { id?: string; tag?: string };
	};

	if (!response.ok || !body.success) {
		throw new CloudflareApiError(
			body.errors?.[0]?.message ??
				`Falha ao criar/atualizar Worker (${response.status}).`,
			{
				status: response.status,
				step: "upload_worker_bindings",
				body,
			},
		);
	}

	const scripts = await cloudflareRequest<WorkerScript[]>(
		input.token,
		`/accounts/${input.accountId}/workers/scripts`,
		{ step: "list_worker_scripts_after_upload" },
	);
	const worker = scripts.find((script) => script.id === input.workerName);

	return {
		tag: worker?.tag ?? body.result?.tag ?? "",
		created: !existing,
		existed: Boolean(existing),
	};
}
