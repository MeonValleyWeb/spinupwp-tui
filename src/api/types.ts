// Type definitions for the SpinupWP REST API (v1).
// Kept intentionally permissive — the API may add fields over time, and we only
// depend on the subset we render. See https://api.spinupwp.com/ for the full spec.

export interface Pagination {
  previous: string | null
  next: string | null
  per_page: number
  count: number
}

export interface ApiList<T> {
  data: T[]
  pagination: Pagination
}

export interface ApiSingle<T> {
  data: T
}

export interface DiskSpace {
  total: number
  available: number
  used: number
  updated_at: string | null
}

export interface ServerDatabase {
  server: string | null
  host: string | null
  port: number | null
}

export type ConnectionStatus = "connected" | "disconnected" | "connecting" | string

export interface Server {
  id: number
  name: string
  provider_name: string | null
  ubuntu_version: string | null
  ip_address: string | null
  ssh_port: number | null
  timezone: string | null
  region: string | null
  size: string | null
  disk_space: DiskSpace | null
  database: ServerDatabase | null
  ssh_publickey?: string | null
  git_publickey?: string | null
  connection_status: ConnectionStatus
  reboot_required: boolean
  upgrade_required: boolean
  install_notes?: string | null
  created_at: string
  status: string
}

export interface AdditionalDomain {
  id: number
  domain: string
  redirect?: {
    enabled: boolean
    type: number
    destination: string
  }
  created_at: string
}

export interface Site {
  id: number
  server_id: number
  domain: string
  additional_domains?: AdditionalDomain[]
  site_user: string | null
  php_version: string | null
  public_folder: string | null
  is_wordpress: boolean
  page_cache?: { enabled: boolean }
  https?: { enabled: boolean }
  nginx?: Record<string, unknown>
  database?: {
    id: number | null
    user_id: number | null
    table_prefix: string | null
  } | null
  backups?: {
    files: boolean
    database: boolean
    retention_period?: number | null
    next_run_time?: string | null
    storage_provider?: { id: number; region: string; bucket: string } | null
  } | null
  wp_core_update?: boolean
  wp_theme_updates?: number
  wp_plugin_updates?: number
  git?: {
    repo: string | null
    branch: string | null
    deploy_script?: string | null
    push_enabled?: boolean
    deployment_url?: string | null
  } | null
  basic_auth?: { enabled: boolean; username?: string | null } | null
  subdomain?: { enabled: boolean; url: string | null } | null
  created_at: string
  status: string
}

export interface Event {
  id: number
  initiated_by: string | null
  server_id: number | null
  name: string
  status: string
  output: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}
