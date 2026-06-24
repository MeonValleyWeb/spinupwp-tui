export type ProviderKey =
  | "spinupwp"
  | "vercel"
  | "netlify"
  | "cloudflare"
  | "hetzner"
  | "digitalocean"

export type ResourceKind =
  | "server"
  | "site"
  | "deployment"
  | "domain"
  | "worker"

export type ProviderAccountSource = "env" | "file" | "runtime"

export interface ProviderAccount {
  id: string
  provider: ProviderKey
  label: string
  source: ProviderAccountSource
}

export interface ProviderCapabilities {
  listServers?: true
  listSites?: true
  listDeployments?: true
  listDomains?: true
  listEvents?: true
  openConsole?: true
  sshHealth?: true
  phpUpgrade?: true
  dbBackup?: true
  dbSync?: true
  redeploy?: true
  restartService?: true
  powerAction?: true
  editDns?: true
}

export interface InventoryDeployment {
  id: string
  provider: ProviderKey
  accountId: string
  siteId?: string
  name: string
  status: string
  url?: string | null
  branch?: string | null
  commitSha?: string | null
  createdAt?: string | null
  finishedAt?: string | null
  rawRef: unknown
}

export interface InventoryServer {
  id: string
  provider: ProviderKey
  accountId: string
  nativeId: string
  name: string
  status: string
  ipAddress?: string | null
  sshPort?: number | null
  region?: string | null
  size?: string | null
  os?: string | null
  providerLabel?: string | null
  tags?: string[]
  createdAt?: string | null
  rawRef: unknown
}

export interface InventorySite {
  id: string
  provider: ProviderKey
  accountId: string
  nativeId: string
  name: string
  primaryDomain?: string | null
  domains: string[]
  status: string
  stack?: string | null
  runtime?: string | null
  serverId?: string | null
  repo?: string | null
  branch?: string | null
  createdAt?: string | null
  latestDeployment?: InventoryDeployment | null
  rawRef: unknown
}

export interface InventoryDomain {
  id: string
  provider: ProviderKey
  accountId: string
  name: string
  siteId?: string | null
  serverId?: string | null
  status?: string | null
  dnsProvider?: string | null
  rawRef: unknown
}

export interface InventoryEvent {
  id: string
  provider: ProviderKey
  accountId: string
  nativeId: string
  name: string
  status: string
  resourceId?: string | null
  resourceKind?: ResourceKind | null
  createdAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  output?: string | null
  rawRef: unknown
}

export interface ProviderInventory {
  provider: ProviderKey
  account: ProviderAccount
  capabilities: ProviderCapabilities
  servers: InventoryServer[]
  sites: InventorySite[]
  deployments: InventoryDeployment[]
  domains: InventoryDomain[]
  events: InventoryEvent[]
  loadedAt: Date
}

export interface ProviderAdapter {
  provider: ProviderKey
  account: ProviderAccount
  capabilities: ProviderCapabilities
  loadInventory(): Promise<ProviderInventory>
}

export class ProviderApiError extends Error {
  provider: ProviderKey
  status: number
  body?: string

  constructor(provider: ProviderKey, message: string, status: number, body?: string) {
    super(message)
    this.name = "ProviderApiError"
    this.provider = provider
    this.status = status
    this.body = body
  }
}
