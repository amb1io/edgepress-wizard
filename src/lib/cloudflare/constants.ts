export const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

export const EDGPRESS_GITHUB = {
	owner: "amb1io",
	repo: "edgepress",
	branch: "main",
	buildCommand: "npm run build",
	/** Base deploy step; wizard chains warm-kv:remote via buildWranglerDeployCommand(). */
	deployCommand: "npx wrangler deploy",
} as const;

export const PLACEHOLDER_WORKER_MODULE = "worker.mjs";

export const PLACEHOLDER_WORKER_SOURCE = `export default {
  async fetch() {
    return new Response(
      "EdgePress Worker provisionado. Aguardando deploy via GitHub Builds.",
      { status: 200 },
    );
  },
};
`;
