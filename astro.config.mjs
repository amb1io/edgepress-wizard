// @ts-check
import { defineConfig, sessionDrivers } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
	// Wizard state lives in browser sessionStorage; avoid KV SESSION binding on deploy.
	session: {
		driver: sessionDrivers.memory(),
	},
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
			configPath: "wrangler.toml",
		},
	}),
	vite: {
		plugins: [tailwindcss()],
	},
});
