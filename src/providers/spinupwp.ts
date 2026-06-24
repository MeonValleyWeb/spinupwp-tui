import { ApiError, SpinupWPClient } from "../api/client.ts"
import type { Event, Server, Site } from "../api/types.ts"
import type {
  InventoryDomain,
  InventoryEvent,
  InventoryServer,
  InventorySite,
  ProviderAccount,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderInventory,
} from "./types.ts"
import { ProviderApiError } from "./types.ts"

const PROVIDER = "spinupwp" as const
const DEFAULT_ACCOUNT_ID = "default"

export const spinupwpCapabilities: ProviderCapabilities = {
  listServers: true,
  listSites: true,
  listEvents: true,
  openConsole: true,
  sshHealth: true,
  phpUpgrade: true,
  dbBackup: true,
  dbSync: true,
  restartService: true,
  editDns: true,
}

export interface SpinupProviderAdapterOptions {
  client: SpinupWPClient
  account?: Partial<ProviderAccount>
  maxEventPages?: number
}

export class SpinupProviderAdapter implements ProviderAdapter {
  provider = PROVIDER
  account: ProviderAccount
  capabilities = spinupwpCapabilities

  private client: SpinupWPClient
  private maxEventPages: number

  constructor(opts: SpinupProviderAdapterOptions) {
    this.client = opts.client
    this.maxEventPages = opts.maxEventPages ?? 2
    this.account = {
      id: opts.account?.id ?? DEFAULT_ACCOUNT_ID,
      provider: PROVIDER,
      label: opts.account?.label ?? "SpinupWP",
      source: opts.account?.source ?? "runtime",
    }
  }

  async loadInventory(): Promise<ProviderInventory> {
    try {
      const [servers, sites] = await Promise.all([this.client.listServers(), this.client.listSites()])
      const events = await this.loadEvents()
      return {
        provider: PROVIDER,
        account: this.account,
        capabilities: this.capabilities,
        servers: servers.map((server) => mapServer(server, this.account.id)),
        sites: sites.map((site) => mapSite(site, this.account.id)),
        deployments: [],
        domains: sites.flatMap((site) => mapSiteDomains(site, this.account.id)),
        events: events.map((event) => mapEvent(event, this.account.id)),
        loadedAt: new Date(),
      }
    } catch (err) {
      throw normalizeSpinupError(err)
    }
  }

  private async loadEvents(): Promise<Event[]> {
    try {
      return await this.client.listEvents(this.maxEventPages)
    } catch {
      return []
    }
  }
}

export function spinupServerId(accountId: string, id: number): string {
  return `${PROVIDER}:${accountId}:server:${id}`
}

export function spinupSiteId(accountId: string, id: number): string {
  return `${PROVIDER}:${accountId}:site:${id}`
}

function spinupEventId(accountId: string, id: number): string {
  return `${PROVIDER}:${accountId}:event:${id}`
}

function spinupDomainId(accountId: string, siteId: number, domain: string): string {
  return `${PROVIDER}:${accountId}:site:${siteId}:domain:${domain.toLowerCase()}`
}

function mapServer(server: Server, accountId: string): InventoryServer {
  return {
    id: spinupServerId(accountId, server.id),
    provider: PROVIDER,
    accountId,
    nativeId: String(server.id),
    name: server.name,
    status: server.status,
    ipAddress: server.ip_address,
    sshPort: server.ssh_port,
    region: server.region,
    size: server.size,
    os: server.ubuntu_version,
    providerLabel: server.provider_name,
    createdAt: server.created_at,
    rawRef: server,
  }
}

function mapSite(site: Site, accountId: string): InventorySite {
  return {
    id: spinupSiteId(accountId, site.id),
    provider: PROVIDER,
    accountId,
    nativeId: String(site.id),
    name: site.domain,
    primaryDomain: site.domain,
    domains: siteDomains(site),
    status: site.status,
    stack: site.is_wordpress ? "wordpress" : "generic",
    runtime: site.php_version,
    serverId: spinupServerId(accountId, site.server_id),
    repo: site.git?.repo ?? null,
    branch: site.git?.branch ?? null,
    createdAt: site.created_at,
    latestDeployment: null,
    rawRef: site,
  }
}

function mapSiteDomains(site: Site, accountId: string): InventoryDomain[] {
  return siteDomains(site).map((domain) => ({
    id: spinupDomainId(accountId, site.id, domain),
    provider: PROVIDER,
    accountId,
    name: domain,
    siteId: spinupSiteId(accountId, site.id),
    serverId: spinupServerId(accountId, site.server_id),
    status: site.status,
    rawRef: site,
  }))
}

function mapEvent(event: Event, accountId: string): InventoryEvent {
  return {
    id: spinupEventId(accountId, event.id),
    provider: PROVIDER,
    accountId,
    nativeId: String(event.id),
    name: event.name,
    status: event.status,
    resourceId: event.server_id == null ? null : spinupServerId(accountId, event.server_id),
    resourceKind: event.server_id == null ? null : "server",
    createdAt: event.created_at,
    startedAt: event.started_at,
    finishedAt: event.finished_at,
    output: event.output,
    rawRef: event,
  }
}

function siteDomains(site: Site): string[] {
  const domains = [site.domain, ...(site.additional_domains?.map((domain) => domain.domain) ?? [])]
  return [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))]
}

function normalizeSpinupError(err: unknown): ProviderApiError {
  if (err instanceof ProviderApiError) return err
  if (err instanceof ApiError) return new ProviderApiError(PROVIDER, err.message, err.status, err.body)
  return new ProviderApiError(PROVIDER, (err as Error).message, 0)
}
