import { deriveWorkerName } from "./site-slug";

export function deriveSitePrefix(siteName: string): string {
	const letters = siteName.toLowerCase().replace(/[^a-z]/g, "");
	const prefix = letters.slice(0, 3);
	return prefix.padEnd(3, "x");
}

export function isValidSitePrefix(prefix: string): boolean {
	return /^[a-z]{3}$/.test(prefix);
}

/** R2: 3–63 chars, lowercase letters, numbers, hyphens; must start/end with alphanumeric. */
export function buildR2BucketName(prefix: string): string {
	return `${prefix.toLowerCase()}-egp-r2`;
}

export type WizardResourcePlan = {
	type: "d1" | "r2" | "kv" | "queue" | "worker";
	label: string;
	name: string;
	binding?: string;
};

export function buildImportQueueNames(prefix: string): {
	importQueue: string;
	importDlq: string;
} {
	const normalizedPrefix = prefix.toLowerCase();
	return {
		importQueue: `${normalizedPrefix}-egp-import-queue`,
		importDlq: `${normalizedPrefix}-egp-import-dlq`,
	};
}

export function buildResourcePlan(
	prefix: string,
	siteName: string,
): WizardResourcePlan[] {
	const normalizedPrefix = prefix.toLowerCase();
	const workerName = deriveWorkerName(siteName);
	const queues = buildImportQueueNames(normalizedPrefix);

	return [
		{
			type: "d1",
			label: "D1 Database",
			name: `${normalizedPrefix}_egp_d1`,
			binding: "DB",
		},
		{
			type: "r2",
			label: "R2 Bucket",
			name: buildR2BucketName(normalizedPrefix),
			binding: "MEDIA_BUCKET",
		},
		{
			type: "kv",
			label: "KV Namespace",
			name: `${normalizedPrefix}_egp_kv`,
			binding: "CACHE",
		},
		{
			type: "queue",
			label: "Import Queue",
			name: queues.importQueue,
			binding: "IMPORT_QUEUE",
		},
		{
			type: "queue",
			label: "Import DLQ",
			name: queues.importDlq,
		},
		{
			type: "worker",
			label: "Worker",
			name: workerName,
		},
	];
}
