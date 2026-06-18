// Global search: fuzzy-ish filtering across every server and site at once.
//
// The input is focused for the whole time this tab is active (so `inputMode`
// stays on and global shortcuts are suppressed). ↑/↓ move through results,
// Enter opens a site in the browser, Esc returns to the dashboard.

import { useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme, statusColor, statusDot } from "../../lib/theme.ts"
import { classifyStack, stackColor, stackTag } from "../../lib/stack.ts"
import { truncate } from "../../lib/format.ts"
import { Panel } from "../components.tsx"
import { List, moveSelection } from "../List.tsx"
import { ServerDetail, SiteDetail } from "../Details.tsx"
import { StatusBar } from "../StatusBar.tsx"
import { openUrl } from "../../lib/open.ts"
import { useStore } from "../store.tsx"
import type { Server, Site } from "../../api/types.ts"

type Result =
  | { kind: "server"; server: Server; haystack: string }
  | { kind: "site"; site: Site; haystack: string }

// Lower score = better match. Returns null when there's no match at all.
function score(haystack: string, q: string): number | null {
  if (!q) return 0
  const i = haystack.indexOf(q)
  if (i < 0) return null
  return i === 0 ? 0 : 1 + i / 100
}

export function Search({ rows }: { rows: number }) {
  const store = useStore()
  const { servers, sites, serverById, setInputMode, setRoute, route, overlayOpen } = store
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)

  // Hold input focus (and suppress global keys) while this tab is mounted.
  useEffect(() => {
    setInputMode(true)
    return () => setInputMode(false)
  }, [setInputMode])

  const pool = useMemo<Result[]>(() => {
    const s: Result[] = servers.map((server) => ({
      kind: "server",
      server,
      haystack: `${server.name} ${server.ip_address ?? ""} ${server.provider_name ?? ""}`.toLowerCase(),
    }))
    const t: Result[] = sites.map((site) => ({
      kind: "site",
      site,
      haystack: `${site.domain} ${site.site_user ?? ""}`.toLowerCase(),
    }))
    return [...s, ...t]
  }, [servers, sites])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const scored = pool
      .map((r) => ({ r, sc: score(r.haystack, q) }))
      .filter((x) => x.sc !== null) as { r: Result; sc: number }[]
    scored.sort((a, b) => {
      if (a.sc !== b.sc) return a.sc - b.sc
      const an = a.r.kind === "server" ? a.r.server.name : a.r.site.domain
      const bn = b.r.kind === "server" ? b.r.server.name : b.r.site.domain
      return an.localeCompare(bn)
    })
    return scored.map((x) => x.r)
  }, [pool, query])

  // Keep the selection in range as results shrink/grow.
  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(0, results.length - 1)))
  }, [results.length])

  const isActive = route === "search" && !overlayOpen

  useKeyboard((key) => {
    if (!isActive) return
    switch (key.name) {
      case "up":
        return setSelected((i) => moveSelection(i, -1, results.length))
      case "down":
        return setSelected((i) => moveSelection(i, 1, results.length))
      case "return": {
        const r = results[selected]
        if (r?.kind === "site") {
          openUrl((r.site.https?.enabled ? "https://" : "http://") + r.site.domain)
          setFlash(`Opening ${r.site.domain}…`)
          setTimeout(() => setFlash(null), 1500)
        }
        return
      }
      case "escape":
        return setRoute("dashboard")
    }
  })

  const current = results[selected]
  const listRows = Math.max(3, rows - 8) // input box (3) + status bar (1) + chrome

  return (
    <box style={{ flexGrow: 1, flexDirection: "column" }}>
      <box style={{ flexDirection: "row", padding: 1, gap: 1 }}>
        <box
          title=" Search "
          titleColor={theme.brand}
          border
          borderColor={theme.borderActive}
          style={{ flexGrow: 1, flexDirection: "row", paddingLeft: 1, paddingRight: 1 }}
        >
          <text content="🔍 " fg={theme.brand} />
          <input
            focused={isActive}
            value={query}
            placeholder="type a server name, domain, or IP…"
            onInput={setQuery}
            style={{ flexGrow: 1, backgroundColor: theme.bg, focusedBackgroundColor: theme.bg, textColor: theme.text }}
          />
          <text content={`${results.length} results`} fg={theme.textDim} />
        </box>
      </box>

      <box style={{ flexGrow: 1, flexDirection: "row", paddingLeft: 1, paddingRight: 1, paddingBottom: 1, gap: 1 }}>
        <Panel title=" Results " active flexGrow={1}>
          <List
            items={results}
            selectedIndex={selected}
            viewportRows={listRows}
            focused
            emptyText={query ? "No matches" : "Start typing to search across your whole account"}
            keyFor={(r, i) => (r.kind === "server" ? `s${r.server.id}` : `w${r.site.id}`) + i}
            renderRow={(r, sel) => {
              if (r.kind === "server") {
                return (
                  <>
                    <text content="SRV " fg={theme.purple} style={{ flexShrink: 0 }} />
                    <text content={statusDot(r.server.connection_status) + " "} fg={statusColor(r.server.connection_status)} style={{ flexShrink: 0 }} />
                    <text content={truncate(r.server.name, 44)} fg={sel ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1, marginRight: 1 }} />
                    <text content={r.server.provider_name ?? ""} fg={theme.textFaint} style={{ flexShrink: 0 }} />
                  </>
                )
              }
              return (
                <>
                  <text content="SITE" fg={theme.accent} style={{ flexShrink: 0 }} />
                  <text content={" " + statusDot(r.site.status) + " "} fg={statusColor(r.site.status)} style={{ flexShrink: 0 }} />
                  <text content={truncate(r.site.domain, 44)} fg={sel ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1, marginRight: 1 }} />
                  <text content={stackTag(classifyStack(r.site))} fg={stackColor(classifyStack(r.site))} style={{ flexShrink: 0 }} />
                </>
              )
            }}
          />
        </Panel>

        <Panel title=" Details " width={44}>
          {current?.kind === "server" ? (
            <ServerDetail server={current.server} siteCount={store.sitesForServer(current.server.id).length} />
          ) : current?.kind === "site" ? (
            <SiteDetail site={current.site} serverName={serverById(current.site.server_id)?.name ?? "—"} />
          ) : (
            <text content="No selection" fg={theme.textFaint} />
          )}
        </Panel>
      </box>

      <StatusBar
        hints={[
          { key: "↑↓", label: "select" },
          { key: "⏎", label: "open site" },
          { key: "esc", label: "dashboard" },
        ]}
        message={flash ?? undefined}
        showGlobal={false}
      />
    </box>
  )
}
