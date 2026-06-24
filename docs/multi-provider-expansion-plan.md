# Multi-provider expansion plan

This project is currently a focused SpinupWP TUI. The expansion should keep the
same useful context model: one fast inventory, one search surface, one details
pane, and only the actions that make sense for the selected resource.

The goal is not to turn it into a generic cloud console. The goal is a personal
operations cockpit for:

- managed site platforms: SpinupWP, Vercel, Netlify, Cloudflare Pages/Workers
- server providers: Hetzner Cloud, DigitalOcean
- cross-cutting context: domains, DNS, local working copies, SSH health, deploy
  state, and safe one-key actions

## Current shape

The app has a strong single-account core:

- `src/api/client.ts` is a typed SpinupWP REST wrapper.
- `src/api/types.ts` defines the SpinupWP `Server`, `Site`, and `Event` shapes.
- `src/ui/store.tsx` owns the global data model, route state, async actions,
  caches, provider DNS connections, and overlays.
- The five-tab UI is compact: Dashboard, Servers, Stacks, Search, Events.
- Existing Cloudflare/AWS/GoDaddy credential support is DNS-focused, not hosting
  inventory-focused.

That means the first work should be an internal architecture pass, not a provider
API grab-bag.

## Product model

Keep a small set of normalized resources:

```ts
type ProviderKey =
  | "spinupwp"
  | "vercel"
  | "netlify"
  | "cloudflare"
  | "hetzner"
  | "digitalocean"

type ResourceKind =
  | "server"
  | "site"
  | "deployment"
  | "domain"
  | "worker"

interface ProviderAccount {
  id: string
  provider: ProviderKey
  label: string
  source: "env" | "file"
}

interface InventoryServer {
  id: string
  provider: ProviderKey
  accountId: string
  name: string
  status: string
  ipAddress?: string | null
  region?: string | null
  size?: string | null
  os?: string | null
  tags?: string[]
  rawRef: unknown
}

interface InventorySite {
  id: string
  provider: ProviderKey
  accountId: string
  name: string
  primaryDomain?: string | null
  domains: string[]
  status: string
  stack?: string | null
  runtime?: string | null
  serverId?: string | null
  repo?: string | null
  branch?: string | null
  latestDeployment?: InventoryDeployment | null
  rawRef: unknown
}
```

Provider adapters convert native API shapes into these resources. The UI should
depend on normalized resources plus capability flags, not direct provider types.

## Capability model

Each adapter advertises what it can do:

```ts
interface ProviderCapabilities {
  listServers?: true
  listSites?: true
  listDeployments?: true
  listDomains?: true
  openConsole?: true
  sshHealth?: true
  redeploy?: true
  restartService?: true
  powerAction?: true
  editDns?: true
}
```

Views then show contextual actions only when supported. This keeps the UI simple:
Vercel sites get deploy/domain actions; Hetzner servers get SSH health and power
actions; SpinupWP sites keep PHP upgrades and DB workflows.

## UI model

Do not add one tab per provider. That would make the app feel larger and less
useful.

Recommended navigation:

- `Dashboard`: all-provider summary, with a provider filter.
- `Inventory`: replaces/renames `Servers`; left pane is providers/accounts or
  servers, middle pane is sites/workers, right pane is details.
- `Stacks`: keep as the app/site composition view, but make it provider-aware.
- `Search`: global search across servers, sites, domains, projects, workers.
- `Events`: unified recent activity where supported, with provider filters.

The header can keep the current low-friction model:

```text
Spinup Ops   1 Dashboard   2 Inventory   3 Stacks   4 Search   5 Events   All providers
```

Add a scope selector inside views rather than extra top-level routes:

```text
Scope: All | SpinupWP | Vercel | Netlify | Cloudflare | Servers
```

## Provider API surface

Use official APIs directly with `fetch`, as the app already does.

- Vercel: projects, deployments, domains, env vars, and redeploy/deployment
  actions through the Vercel REST API.
  Source: https://vercel.com/docs/rest-api
- Netlify: sites, deploys, forms, DNS/domains, env vars, and deploy actions
  through the Netlify REST API.
  Source: https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/
- Cloudflare: Pages projects/deployments plus Workers scripts/routes through
  Cloudflare APIs. Reuse the existing Cloudflare token machinery where scopes
  permit, but separate DNS credentials from hosting credentials in the UI.
  Sources:
  https://developers.cloudflare.com/pages/configuration/api/
  https://developers.cloudflare.com/api/
- Hetzner: servers, locations, primary IPs, firewalls, volumes, images, actions.
  Source: https://docs.hetzner.cloud/
- DigitalOcean: Droplets, App Platform apps, domains, load balancers, actions.
  Source: https://docs.digitalocean.com/reference/api/

## Step-by-step PR plan

### PR 1: Internal provider foundation

No new provider behavior yet.

- Add `src/providers/types.ts` for normalized inventory resources, account
  config, provider capabilities, and common errors.
- Move the existing SpinupWP client behind a `SpinupProviderAdapter`.
- Keep existing UI behavior unchanged by mapping SpinupWP resources into both the
  old view shape and the new normalized shape during the transition.
- Add adapter tests for pagination/error handling if a test harness is added; at
  minimum keep `bun run typecheck` green.

Release value: zero UX change, lower future risk.

### PR 2: Account and credential manager

- Generalize config from a single `token` to `accounts`.
- Preserve backwards compatibility with `SPINUPWP_ACCESS_TOKEN` and the current
  `config.json` shape.
- Add `spinup accounts` or an in-app Accounts overlay for adding/removing tokens.
- Model env-provided accounts as read-only, like current DNS connections.
- Keep secrets in `~/.config/spinupwp-tui/config.json` with chmod `600`.

Release value: users can connect future providers without reworking onboarding.

### PR 3: Unified inventory store

- Split `src/ui/store.tsx` into smaller modules:
  - data loading and refresh
  - selection/navigation
  - provider accounts
  - SpinupWP write actions
  - DNS/local/SSH workflows
- Add a normalized `inventory` slice with servers, sites, deployments, domains,
  events, provider load states, and last-updated timestamps.
- Keep the current `servers`/`sites` selectors as compatibility selectors while
  migrating views.

Release value: the store becomes survivable before adding more APIs.

### PR 4: Provider-aware dashboard/search/details

- Update Dashboard metrics to aggregate across normalized resources.
- Add provider badges and scope filtering.
- Update Search to search provider/account/domain/project fields.
- Add generic detail panels for non-SpinupWP resources.
- Keep SpinupWP-specific actions visible only on SpinupWP resources.

Release value: the app is ready to display multiple providers even before they
are all implemented.

### PR 5: Vercel read-only adapter

- Add `src/providers/vercel/client.ts` and adapter.
- Load projects, production domains, latest deployments, repo/branch, framework,
  and project/account metadata.
- Add console deep links for project, deployment, and domain.
- Avoid writes in the first Vercel PR.

Release value: Vercel sites appear in Dashboard, Inventory, Search, and Details.

### PR 6: Netlify read-only adapter

- Add `src/providers/netlify/client.ts` and adapter.
- Load sites, custom domains, latest deploys, repo/branch, framework/build
  metadata where available.
- Add console deep links.
- Avoid writes in the first Netlify PR.

Release value: Netlify joins the same inventory without changing the UI model.

### PR 7: Cloudflare Pages and Workers read-only adapter

- Add `src/providers/cloudflare/client.ts` with Pages and Workers methods.
- Load Pages projects, deployments, domains, branch/source metadata.
- Load Workers scripts/routes/domains where the token has access.
- Keep DNS editing separate from hosting inventory, but let the same account
  token be reused when scopes are sufficient.

Release value: Cloudflare Pages/Workers become first-class resources.

### PR 8: Domain and ownership graph

- Build a cross-provider domain index:
  - domain -> DNS host
  - domain -> serving platform
  - domain -> server IP, when applicable
  - server IP -> sites pointing here
- Use existing DNS cache/query work as the base.
- Show conflicts and useful gaps:
  - domain exists in Vercel/Netlify/Cloudflare but DNS points elsewhere
  - DNS points to a server with no known managed site
  - server has a site whose domain is not pointed at it

Release value: the app becomes a migration and cleanup tool, not just inventory.

### PR 9: Hetzner and DigitalOcean server inventory

- Add read-only adapters for Hetzner Cloud servers and DigitalOcean Droplets.
- Normalize public IP, region, size, image/OS, status, tags, backups, volumes.
- Reuse the existing SSH health overlay where local SSH auth works.
- Map DNS/site records to these servers by IP.

Release value: unmanaged servers become visible and searchable alongside
SpinupWP-managed servers.

### PR 10: Safe write actions by capability

Add writes only after read-only inventory has settled.

- Vercel: redeploy latest production deployment or trigger deployment hook if
  configured.
- Netlify: retry deploy or trigger build hook if configured.
- Cloudflare Pages: retry/trigger deployment; Workers should start with console
  handoff unless the API workflow is very clear.
- Hetzner/DigitalOcean: power actions, reboot, maybe snapshots.
- Every write must use the existing confirm-before-firing overlay pattern.
- Every long-running action should use the current async progress model.

Release value: one-key operations, still safe and contextual.

## Naming

At some point the binary and package name should probably change from `spinup`
and `spinupwp-tui`. Do not do that early. Keep compatibility while the internal
model changes, then do a release with aliases:

- old command: `spinup`
- new command candidate: `sites`, `ops`, `webops`, or `orbit`

The rename should be its own PR/release because it touches install docs, package
metadata, screenshots, and user muscle memory.

## Risks and constraints

- Provider APIs expose different concepts. Normalize for browsing and details,
  but keep native provider detail available in provider-specific panels.
- Tokens need different scopes. Verification should report what is available,
  not just pass/fail.
- Rate limits and pagination differ. Adapters need provider-local pagination and
  error handling.
- The current store is already large. Split it before adding providers.
- Server providers do not know what "sites" are unless DNS, tags, labels, SSH, or
  local conventions connect the dots.
- Cloudflare appears twice: DNS provider and hosting/serverless provider. Treat
  those as separate capabilities under one account.

## First implementation target

The smallest useful vertical slice is:

1. Adapter types.
2. SpinupWP adapter preserving current behavior.
3. Normalized inventory selectors.
4. Provider-aware Search showing SpinupWP through the new model.

That PR proves the architecture without involving any new third-party API.
