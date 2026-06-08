# EdgePress Wizard

Web wizard to provision Cloudflare resources and deploy [EdgePress](https://github.com/amb1io/edgepress) (`amb1io/edgepress@main`) with a guided setup flow.

Built with **Astro 6**, **Tailwind CSS v4**, **daisyUI**, and the **Node adapter** (`@astrojs/node`).

## What it does

The wizard walks you through three steps:

| Step | Route | Purpose |
|------|-------|---------|
| 1 | `/setup/1` | Validate a Cloudflare API token |
| 2 | `/setup/2` | Configure admin user, site name, prefix, optional custom domain |
| 3 | `/setup/3` | Review resources, evaluate existing ones, run install |

On install, the wizard:

1. Creates or reuses **D1**, **KV**, **R2**, and a **Worker** on your Cloudflare account
2. Uploads the Worker with bindings and enables `workers.dev`
3. Sets `BETTER_AUTH_SECRET` and generates a per-site `wrangler.toml`
4. Triggers a **GitHub Build** from `amb1io/edgepress@main` that:
   - Writes `wrangler.toml` from build env vars
   - Runs `wrangler d1 migrations apply` on the remote D1 database
   - Runs `wrangler d1 execute` with `drizzle/seed/seed-remote.sql` (EdgePress default seed)
   - Builds and deploys the Worker
5. Calls `POST /api/setup` on the deployed site to create the **admin user** and set `site_name`, `site_description`, and `setup_done=Y`

Wizard-specific data (admin + site settings) is **not** part of the EdgePress seed; it is applied after deploy via the setup API.

## Resource naming

Given site name **"Farra Media"** and prefix **`dem`**:

| Resource | Name | Binding |
|----------|------|---------|
| D1 | `dem_egp_d1` | `DB` |
| KV | `dem_egp_kv` | `CACHE` |
| R2 | `dem-egp-r2` | `MEDIA_BUCKET` |
| Worker | `farra-media` (slug from site name) | — |

The Worker name is derived from the site name (`deriveWorkerName`), not from the prefix.

## Requirements

- **Node.js** ≥ 22.12
- A **Cloudflare account** with Workers, D1, KV, and R2 enabled
- A **Cloudflare API token** with at least:
  - Account Settings Read
  - D1 Edit
  - KV Storage Edit
  - Workers R2 Storage Edit
  - Workers Scripts Edit
  - Workers Builds Configuration Edit (+ Read for build polling/logs)
  - Zone Read (if associating a custom domain in step 2)
- A **Workers Builds API token** configured in the Cloudflare dashboard (Workers → Settings → Builds)
- The EdgePress GitHub repo connected to Workers Builds (the wizard configures the trigger)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321). The app redirects to `/setup/1`.

For local development you can store your API token in `.env.local` (gitignored):

```env
token=your_cloudflare_api_token
```

The teardown script also reads `CLOUDFLARE_API_TOKEN`, `CF_API_TOKEN`, or `token=` from `.env.local`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build to `./dist/` |
| `npm run preview` | Local preview with `wrangler dev` |
| `npm run deploy` | Build and deploy to Cloudflare Workers (`wrangler.toml`) |

### Teardown test resources

Remove Cloudflare resources created during a test install:

```bash
./scripts/teardown-test-resources.sh "Farra Media"
./scripts/teardown-test-resources.sh dem --yes
./scripts/teardown-test-resources.sh dem --worker farra-media --dry-run
```

Deletes the Worker (slug + legacy `{prefix}_egp_worker`), KV, D1, and R2 (bucket emptied first). Does **not** remove build triggers or secrets.

## Project structure

```
src/
  components/          # UI (WizardSteps, Notificacao, …)
  layouts/             # SetupLayout
  lib/
    cloudflare/        # API client, provision, install, wrangler config, build polling
    wizard/            # Session keys, resource plan, site slug
  pages/
    setup/             # Wizard steps 1–3
    api/cloudflare/    # validate-token, install, evaluate-resources, zones
scripts/
  teardown-test-resources.sh
```

## Install flow (server-side)

`POST /api/cloudflare/install` runs `installEdgePressSite()`:

```
resolve_account → fetch_github_repo → provision_resources
→ upload_worker_bindings → resolve_workers_subdomain
→ build_wrangler_config → set_better_auth_secret
→ enable_worker_subdomain → setup_github_builds
→ wait_worker_build → complete_edgepress_setup
→ [update_site_url_setting if custom domain]
```

Build failures surface in the UI and in server logs (`debug.buildLogs`).

## Better Auth

The generated `wrangler.toml` sets `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`:

- **Custom domain** (step 2): `https://{zone}` + `workers.dev` URL in trusted origins
- **Default**: `https://{worker}.{subdomain}.workers.dev`

`BETTER_AUTH_SECRET` is a random 32-byte value set via the Workers secrets API before the build.

## Related projects

- [EdgePress](https://github.com/amb1io/edgepress) — CMS that runs on Cloudflare Workers
- [Amb1.io](https://amb1.io)

## License

ISC (see `package.json`).
