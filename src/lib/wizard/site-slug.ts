/** Cloudflare Worker script name: lowercase letters, numbers, hyphens. */
export function deriveWorkerName(siteName: string): string {
	const slug = siteName
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63);

	return slug || "edgepress-site";
}
