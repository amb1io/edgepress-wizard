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
	type: "d1" | "r2" | "kv" | "worker";
	label: string;
	name: string;
	binding?: string;
};

export function buildResourcePlan(
	prefix: string,
	siteName: string,
): WizardResourcePlan[] {
	const normalizedPrefix = prefix.toLowerCase();
	const workerName = deriveWorkerName(siteName);

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
			type: "worker",
			label: "Worker",
			name: workerName,
		},
	];
}
