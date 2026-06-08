import { cloudflareRequest } from "./api-client";
import type { WizardSetupConfig } from "../wizard/session";

export type EdgePressSetupResult = {
	adminEmail: string;
	siteName: string;
	loginUrl: string;
	siteUrlUpdated?: boolean;
};

function normalizeOrigin(url: string): string {
	return url.replace(/\/$/, "");
}

function resolveSetupError(location: string | null): string {
	if (!location) return "EdgePress setup failed.";
	const match = location.match(/[?&]error=([^&]+)/);
	if (!match?.[1]) return "EdgePress setup failed.";
	const code = decodeURIComponent(match[1]);
	const messages: Record<string, string> = {
		missing_fields: "Missing required setup fields.",
		password_too_short: "Password must be at least 8 characters.",
		signup_failed: "Could not create admin user.",
		email_already_exists: "Email is already in use.",
		invalid_request: "Invalid setup request.",
	};
	return messages[code] ?? `EdgePress setup failed (${code}).`;
}

export async function completeEdgePressSetup(input: {
	workerBaseUrl: string;
	config: WizardSetupConfig;
}): Promise<EdgePressSetupResult> {
	const origin = normalizeOrigin(input.workerBaseUrl);
	const body = new URLSearchParams({
		name: input.config.name,
		email: input.config.email,
		password: input.config.password,
		site_name: input.config.siteName,
		site_description: input.config.siteDescription,
	});

	const response = await fetch(`${origin}/api/setup`, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Origin: origin,
		},
		body,
		redirect: "manual",
	});

	if (response.status === 303 || response.status === 302) {
		const location = response.headers.get("location");
		if (location?.includes("error=")) {
			throw new Error(resolveSetupError(location));
		}

		const loginPath = location?.startsWith("http")
			? location
			: `${origin}${location ?? "/login?setup=success"}`;

		return {
			adminEmail: input.config.email,
			siteName: input.config.siteName,
			loginUrl: loginPath,
		};
	}

	if (response.ok) {
		return {
			adminEmail: input.config.email,
			siteName: input.config.siteName,
			loginUrl: `${origin}/login?setup=success`,
		};
	}

	const text = await response.text().catch(() => "");
	throw new Error(
		text.trim() ||
			`EdgePress setup returned HTTP ${response.status}.`,
	);
}

export async function updateSiteUrlSetting(input: {
	token: string;
	accountId: string;
	d1DatabaseId: string;
	siteUrl: string;
}): Promise<void> {
	await cloudflareRequest<unknown>(
		input.token,
		`/accounts/${input.accountId}/d1/database/${input.d1DatabaseId}/query`,
		{
			method: "POST",
			step: "update_site_url_setting",
			body: JSON.stringify({
				sql: "UPDATE edp_settings SET value = ? WHERE name = ?",
				params: [input.siteUrl, "site_url"],
			}),
		},
	);
}
