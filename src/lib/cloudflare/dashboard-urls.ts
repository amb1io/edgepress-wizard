const DASHBOARD_BASE = "https://dash.cloudflare.com";

function accountPath(accountId: string, path: string): string {
	return `${DASHBOARD_BASE}/${accountId}${path}`;
}

export function d1DatabaseUrl(accountId: string, databaseId: string): string {
	return accountPath(accountId, `/workers/d1/databases/${databaseId}`);
}

export function kvNamespaceUrl(accountId: string, namespaceId: string): string {
	return accountPath(accountId, `/workers/kv/namespaces/${namespaceId}`);
}

export function r2BucketUrl(accountId: string, bucketName: string): string {
	return accountPath(
		accountId,
		`/r2/default/buckets/${encodeURIComponent(bucketName)}`,
	);
}

export function queueUrl(accountId: string, queueId: string): string {
	return accountPath(accountId, `/queues/${queueId}`);
}

export function workerServiceUrl(accountId: string, workerName: string): string {
	return accountPath(
		accountId,
		`/workers/services/view/${encodeURIComponent(workerName)}/production`,
	);
}

export function workerBuildsUrl(accountId: string, workerName: string): string {
	return accountPath(
		accountId,
		`/workers/services/view/${encodeURIComponent(workerName)}/production/builds`,
	);
}
