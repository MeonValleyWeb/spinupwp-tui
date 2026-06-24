// Vercel provider adapter — read-only inventory from the Vercel REST API.
//
// Maps Vercel projects → InventorySite, their latest deployment →
// InventoryDeployment, and custom domains → InventoryDomain. The Vercel API
// uses Bearer auth; an optional teamId scopes the token to a team.
//
// API reference: https://vercel.com/docs/rest-api
//   GET /v9/projects               — list projects (paginated by timestamp)
//   GET /v9/projects/{id}/domains  — list a project's custom domains

import type {
  InventoryDeployment,
  InventoryDomain,
  InventorySite,
  ProviderAccount,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderInventory,
} from "./types.ts"
import { ProviderApiError } from "./types.ts"

const PROVIDER = "vercel" as const
const BASE_URL = "https://api.vercel.com"
const MAX_PAGES = 20

export const vercelCapabilities: ProviderCapabilities = {
  listSites: true,
  listDeployments: true,
  listDomains: true,
  openConsole: true,
}

export interface VercelProviderAdapterOptions {
  token: string
  teamId?: string
  account?: Partial<ProviderAccount>
}

// ---- Vercel API response shapes (subset we depend on) ----------------------

interface VercelDeployment {
  id: string
  url?: string
  state?: string
  target?: string | null
  meta?: Record<string, string | undefined>
  createdAt?: number
  ready?: number | null
}

interface VercelProject {
  id: string
  name: string
  framework?: string | null
  nodeVersion?: number | null
  target?: string | null
  createdAt?: number
  updatedAt?: number
  latestDeployments?: VercelDeployment[]
}

interface VercelProjectList {
  projects: VercelProject[]
  pagination?: { count?: number; next?: number | null }
}

interface VercelDomain {
  name: string
  verified?: boolean
  gitBranch?: string | null
}

interface VercelDomainList {
  domains: VercelDomain[]
}

// ---- Client ---------------------------------------------------------------

class VercelClient {
  private token: string
  private teamId?: string

  constructor(token: string, teamId?: string) {
    this.token = token
    this.teamId = teamId
  }

  private async request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(BASE_URL + path)
    if (this.teamId) url.searchParams.set("teamId", this.teamId)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }

    let res: Response
    try {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "User-Agent": "spinupwp-tui",
        },
      })
    } catch (err) {
      throw new ProviderApiError(PROVIDER, `Network error reaching the Vercel API: ${(err as Error).message}`, 0)
    }

    if (res.status === 401) throw new ProviderApiError(PROVIDER, "Unauthorized — your Vercel token was rejected (401).", 401)
    if (res.status === 403) throw new ProviderApiError(PROVIDER, "Forbidden — this token lacks access (403).", 403)
    if (res.status === 429) throw new ProviderApiError(PROVIDER, "Rate limited by the Vercel API (429). Try again shortly.", 429)
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new ProviderApiError(PROVIDER, `Vercel API error (HTTP ${res.status}).`, res.status, body)
    }

    return (await res.json()) as T
  }

  async listProjects(): Promise<VercelProject[]> {
    const all: VercelProject[] = []
    let until: number | undefined
    let page = 0
    while (page < MAX_PAGES) {
      const res = await this.request<VercelProjectList>("/v9/projects", { until, limit: 100 })
      all.push(...res.projects)
      if (!res.pagination?.next) break
      until = res.pagination.next
      page++
    }
    return all
  }

  async listDomains(projectId: string): Promise<VercelDomain[]> {
    const res = await this.request<VercelDomainList>(`/v9/projects/${projectId}/domains`)
    return res.domains ?? []
  }
}

// ---- Adapter ---------------------------------------------------------------

export class VercelProviderAdapter implements ProviderAdapter {
  provider = PROVIDER
  account: ProviderAccount
  capabilities = vercelCapabilities

  private client: VercelClient

  constructor(opts: VercelProviderAdapterOptions) {
    this.client = new VercelClient(opts.token, opts.teamId)
    this.account = {
      id: opts.account?.id ?? "default",
      provider: PROVIDER,
      label: opts.account?.label ?? "Vercel",
      source: opts.account?.source ?? "runtime",
    }
  }

  async loadInventory(): Promise<ProviderInventory> {
    try {
      const projects = await this.client.listProjects()

      // Fetch domains for every project in parallel (bounded to avoid hammering).
      const domainResults = await this.boundedMap(projects, (p) => this.client.listDomains(p.id), 10)

      const sites: InventorySite[] = []
      const deployments: InventoryDeployment[] = []
      const domains: InventoryDomain[] = []

      for (let i = 0; i < projects.length; i++) {
        const project = projects[i]
        const projectDomains = domainResults[i]
        const domainNames = projectDomains.map((d) => d.name)
        const latest = project.latestDeployments?.[0] ?? null

        sites.push(mapProject(project, this.account.id, domainNames, latest))
        if (latest) deployments.push(mapDeployment(latest, this.account.id, project))
        for (const d of projectDomains) {
          domains.push(mapDomain(d, this.account.id, project))
        }
      }

      return {
        provider: PROVIDER,
        account: this.account,
        capabilities: this.capabilities,
        servers: [],
        sites,
        deployments,
        domains,
        events: [],
        loadedAt: new Date(),
      }
    } catch (err) {
      throw err instanceof ProviderApiError ? err : new ProviderApiError(PROVIDER, (err as Error).message, 0)
    }
  }

  // Run an async mapper over items with a bounded concurrency pool.
  private async boundedMap<T, R>(items: T[], mapper: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
    if (items.length === 0) return []
    const results: R[] = new Array(items.length)
    let cursor = 0
    const worker = async () => {
      while (cursor < items.length) {
        const idx = cursor++
        results[idx] = await mapper(items[idx])
      }
    }
    const n = Math.min(concurrency, items.length)
    await Promise.all(Array.from({ length: n }, () => worker()))
    return results
  }
}

// ---- Mappers ---------------------------------------------------------------

function vercelSiteId(accountId: string, projectId: string): string {
  return `${PROVIDER}:${accountId}:site:${projectId}`
}

function vercelDeploymentId(accountId: string, deploymentId: string): string {
  return `${PROVIDER}:${accountId}:deployment:${deploymentId}`
}

function vercelDomainId(accountId: string, projectId: string, domain: string): string {
  return `${PROVIDER}:${accountId}:site:${projectId}:domain:${domain.toLowerCase()}`
}

function mapProject(
  project: VercelProject,
  accountId: string,
  domainNames: string[],
  latest: VercelDeployment | null,
): InventorySite {
  const primaryDomain = domainNames.find((d) => !d.endsWith(".vercel.app")) ?? domainNames[0] ?? `${project.name}.vercel.app`
  return {
    id: vercelSiteId(accountId, project.id),
    provider: PROVIDER,
    accountId,
    nativeId: project.id,
    name: project.name,
    primaryDomain,
    domains: domainNames.length > 0 ? domainNames : [`${project.name}.vercel.app`],
    status: latest?.state ?? "unknown",
    stack: project.framework ?? "static",
    runtime: project.nodeVersion ? `Node ${project.nodeVersion}` : null,
    serverId: null,
    repo: null,
    branch: latest?.meta?.githubCommitRef ?? null,
    createdAt: project.createdAt ? new Date(project.createdAt * 1000).toISOString() : null,
    latestDeployment: latest ? mapDeployment(latest, accountId, project) : null,
    rawRef: project,
  }
}

function mapDeployment(
  dep: VercelDeployment,
  accountId: string,
  project: VercelProject,
): InventoryDeployment {
  return {
    id: vercelDeploymentId(accountId, dep.id),
    provider: PROVIDER,
    accountId,
    siteId: vercelSiteId(accountId, project.id),
    name: project.name,
    status: dep.state ?? "unknown",
    url: dep.url ? `https://${dep.url}` : null,
    branch: dep.meta?.githubCommitRef ?? null,
    commitSha: dep.meta?.githubCommitSha ?? null,
    createdAt: dep.createdAt ? new Date(dep.createdAt * 1000).toISOString() : null,
    finishedAt: dep.ready ? new Date(dep.ready * 1000).toISOString() : null,
    rawRef: dep,
  }
}

function mapDomain(
  domain: VercelDomain,
  accountId: string,
  project: VercelProject,
): InventoryDomain {
  return {
    id: vercelDomainId(accountId, project.id, domain.name),
    provider: PROVIDER,
    accountId,
    name: domain.name,
    siteId: vercelSiteId(accountId, project.id),
    serverId: null,
    status: domain.verified ? "verified" : "pending",
    rawRef: domain,
  }
}

// Console deep link for a Vercel project.
export function vercelProjectUrl(projectId: string, teamId?: string | null): string {
  const base = `https://vercel.com/projects/${projectId}`
  return teamId ? `${base}?teamId=${teamId}` : base
}
