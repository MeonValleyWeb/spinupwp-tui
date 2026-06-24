// Server & site browser: a three-pane master/detail navigator.
//
//   [ Servers ] → [ Sites on server ] → [ Details of focused item ]
//
// Tab / →  moves focus rightward, ← / Esc moves it back. ↑/↓ (or j/k) move the
// selection in the focused pane. `o` opens the selected site in the browser.
//
// Multi-provider: the left pane lists SpinupWP servers followed by provider
// entries (e.g. Vercel). Selecting a provider shows its projects in the sites
// pane with provider-tagged rows and an external-site detail panel.

import { useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme, statusColor, statusDot } from "../../lib/theme.ts"
import { classifyStack, stackColor, stackTag } from "../../lib/stack.ts"
import { truncate } from "../../lib/format.ts"
import { Panel, PhpVersionCell, Spinner, SiteMetaCell } from "../components.tsx"
import { List, moveSelection } from "../List.tsx"
import { ServerDetail, SiteDetail, ExternalSiteDetail, SiteContextStrip, SITE_CONTEXT_STRIP_HEIGHT } from "../Details.tsx"
import { StatusBar } from "../StatusBar.tsx"
import { openUrl } from "../../lib/open.ts"
import { serverWebUrl, siteWebUrl } from "../../lib/spinupweb.ts"
import { useStore, isServerOpInFlight } from "../store.tsx"
import { vercelProjectUrl } from "../../providers/vercel.ts"
import type { Server, Site } from "../../api/types.ts"
import type { InventorySite, ProviderInventory } from "../../providers/types.ts"

type Focus = "servers" | "sites"

// Left-pane items: a SpinupWP server or a provider inventory (virtual "server").
type LeftItem =
  | { kind: "server"; server: Server }
  | { kind: "provider"; inventory: ProviderInventory }

// Middle-pane items: a SpinupWP site or an external provider site.
type MiddleItem =
  | { kind: "site"; site: Site }
  | { kind: "external"; site: InventorySite }

function providerTag(provider: string): string {
  switch (provider) {
    case "vercel": return "VERC"
    case "netlify": return "NETL"
    case "cloudflare": return "CFPG"
    case "hetzner": return "HETZ"
    case "digitalocean": return "DO"
    default: return provider.slice(0, 4).toUpperCase()
  }
}

export function Browser({ rows }: { rows: number }) {
  const store = useStore()
  const { servers, sitesForServer, route, inputMode, overlayOpen, setHealthServer, runProbe, accountSlug, vercelTeamId, setPhpUpgradeSite, phpUpgrades, setServerActionsServer, serverOps, setLocalLinkSite, openLocalTerminal, openLocalUrl, localLinks, sshSite, setDnsInventoryServer, providerInventories } = store

  const [serverIndex, setServerIndex] = useState(0)
  const [siteIndex, setSiteIndex] = useState(0)
  const [focus, setFocus] = useState<Focus>("servers")
  const [flash, setFlash] = useState<string | null>(null)

  // Build the left-pane list: sorted SpinupWP servers, then provider entries.
  const leftItems = useMemo<LeftItem[]>(() => {
    const items: LeftItem[] = [...servers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ kind: "server" as const, server: s }))
    for (const inv of providerInventories) {
      if (inv.sites.length > 0) items.push({ kind: "provider" as const, inventory: inv })
    }
    return items
  }, [servers, providerInventories])

  const leftItem = leftItems[Math.min(serverIndex, leftItems.length - 1)]

  // Build the middle-pane items based on the selected left item.
  const middleItems = useMemo<MiddleItem[]>(() => {
    if (!leftItem) return []
    if (leftItem.kind === "server") {
      return [...sitesForServer(leftItem.server.id)]
        .sort((a, b) => a.domain.localeCompare(b.domain))
        .map((s) => ({ kind: "site" as const, site: s }))
    }
    return [...leftItem.inventory.sites]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ kind: "external" as const, site: s }))
  }, [leftItem, sitesForServer])

  // Reset site selection whenever the active server/provider changes.
  useEffect(() => {
    setSiteIndex(0)
  }, [serverIndex])

  const isActive = route === "servers" && !inputMode && !overlayOpen

  const flashMsg = (m: string) => {
    setFlash(m)
    setTimeout(() => setFlash(null), 1500)
  }

  const openExternalSite = (s: InventorySite) => {
    const url = s.latestDeployment?.url ?? (s.primaryDomain ? `https://${s.primaryDomain}` : null)
    if (url) {
      openUrl(url)
      flashMsg(`Opening ${s.name}…`)
    } else {
      flashMsg("No URL available for this project")
    }
  }

  const openExternalConsole = (s: InventorySite) => {
    if (s.provider === "vercel") {
      openUrl(vercelProjectUrl(s.nativeId, vercelTeamId))
      flashMsg("Opening in Vercel…")
    } else {
      flashMsg(`No console link for ${s.provider}`)
    }
  }

  useKeyboard((key) => {
    if (!isActive) return
    const raw = key.name ?? ""
    const name = key.shift && raw.length === 1 ? raw.toUpperCase() : raw

    const moveBy = (delta: number) => {
      if (focus === "servers") setServerIndex((i) => moveSelection(i, delta, leftItems.length))
      else setSiteIndex((i) => moveSelection(i, delta, middleItems.length))
    }

    switch (name) {
      case "up":
      case "k":
        return moveBy(-1)
      case "down":
      case "j":
        return moveBy(1)
      case "g":
        return focus === "servers" ? setServerIndex(0) : setSiteIndex(0)
      case "G":
        return focus === "servers" ? setServerIndex(leftItems.length - 1) : setSiteIndex(middleItems.length - 1)
      case "right":
      case "l":
      case "return":
      case "tab":
        if (focus === "servers" && middleItems.length > 0) setFocus("sites")
        return
      case "left":
      case "escape":
        if (focus === "sites") setFocus("servers")
        return
      case "o":
        if (focus === "sites" && middleItems[siteIndex]) {
          const item = middleItems[siteIndex]
          if (item.kind === "site") {
            openUrl((item.site.https?.enabled ? "https://" : "http://") + item.site.domain)
            flashMsg(`Opening ${item.site.domain}…`)
          } else {
            openExternalSite(item.site)
          }
        }
        return
      case "d":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site") {
          runProbe(middleItems[siteIndex].site)
          flashMsg(`Identifying the app on ${middleItems[siteIndex].site.domain}…`)
        }
        return
      case "u":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site") setPhpUpgradeSite(middleItems[siteIndex].site)
        return
      case "L":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site") setLocalLinkSite(middleItems[siteIndex].site)
        return
      case "t":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site") flashMsg(openLocalTerminal(middleItems[siteIndex].site.id))
        return
      case "v":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site") flashMsg(openLocalUrl(middleItems[siteIndex].site.id))
        return
      case "s":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site") flashMsg(sshSite(middleItems[siteIndex].site.id))
        return
      case "n":
        if (focus === "sites" && middleItems[siteIndex]?.kind === "site" && leftItem?.kind === "server") setDnsInventoryServer(leftItem.server, middleItems[siteIndex].site.id)
        return
      case "N":
        if (leftItem?.kind === "server") setDnsInventoryServer(leftItem.server)
        return
      case "a":
        if (focus === "servers" && leftItem?.kind === "server") setServerActionsServer(leftItem.server)
        return
      case "h":
        if (leftItem?.kind === "server") setHealthServer(leftItem.server)
        return
      case "w":
        if (focus === "sites" && middleItems[siteIndex]) {
          const item = middleItems[siteIndex]
          if (item.kind === "site") {
            openUrl(siteWebUrl(item.site.id, accountSlug))
            flashMsg(accountSlug ? "Opening in SpinupWP…" : "Set accountSlug for deep links — opening dashboard")
          } else {
            openExternalConsole(item.site)
          }
        } else if (leftItem?.kind === "server") {
          openUrl(serverWebUrl(leftItem.server.id, accountSlug))
          flashMsg(accountSlug ? "Opening in SpinupWP…" : "Set accountSlug for deep links — opening dashboard")
        }
        return
    }
  })

  const listRows = Math.max(3, rows - 6 - SITE_CONTEXT_STRIP_HEIGHT)
  const focusedItem = middleItems[Math.min(siteIndex, Math.max(0, middleItems.length - 1))]

  const isExternalLeft = leftItem?.kind === "provider"
  const leftLabel = leftItem?.kind === "server" ? leftItem.server.name : leftItem?.kind === "provider" ? leftItem.inventory.account.label : "—"

  const hints =
    focus === "servers"
      ? isExternalLeft
        ? [
            { key: "↑↓/jk", label: "select" },
            { key: "→/⏎", label: "view projects" },
            { key: "esc", label: "back" },
          ]
        : [
            { key: "↑↓/jk", label: "select" },
            { key: "→/⏎", label: "view sites" },
            { key: "a", label: "server actions" },
            { key: "N", label: "DNS hosts" },
            { key: "h", label: "health" },
            { key: "w", label: "SpinupWP" },
          ]
      : focusedItem?.kind === "external"
        ? [
            { key: "↑↓/jk", label: "select" },
            { key: "←/esc", label: "back" },
            { key: "o", label: "open" },
            { key: "w", label: "console" },
          ]
        : [
            { key: "↑↓/jk", label: "select site" },
            { key: "←/esc", label: "back" },
            { key: "d", label: "identify app" },
            { key: "n", label: "DNS host" },
            { key: "u", label: "change PHP" },
            { key: "o", label: "open" },
            { key: "s", label: "ssh" },
            { key: "h", label: "health" },
          ]

  const totalLeft = leftItems.length

  return (
    <box style={{ flexGrow: 1, flexDirection: "column" }}>
      <box style={{ flexGrow: 1, flexDirection: "row", padding: 1, gap: 1 }}>
        {/* Left pane: servers + providers */}
        <Panel title={` Servers (${totalLeft}) `} active={focus === "servers"} width={34}>
          <List
            items={leftItems}
            selectedIndex={serverIndex}
            viewportRows={listRows}
            focused={focus === "servers"}
            keyFor={(item, i) => item.kind === "server" ? `s${item.server.id}` : `p${item.inventory.provider}`}
            emptyText="No servers"
            renderRow={(item, selected) => {
              if (item.kind === "provider") {
                const inv = item.inventory
                return (
                  <>
                    <text content={providerTag(inv.provider) + " "} fg={selected ? theme.text : theme.purple} style={{ flexShrink: 0 }} />
                    <text content={truncate(inv.account.label, 22)} fg={selected ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1 }} />
                    <text content={" " + inv.sites.length} fg={selected ? theme.text : theme.textFaint} style={{ flexShrink: 0 }} />
                  </>
                )
              }
              const s = item.server
              const count = sitesForServer(s.id).length
              const op = serverOps.get(s.id)
              return (
                <>
                  <text content={statusDot(s.connection_status) + " "} fg={statusColor(s.connection_status)} style={{ flexShrink: 0 }} />
                  <text content={truncate(s.name, 22)} fg={selected ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1 }} />
                  {op && isServerOpInFlight(op) ? (
                    <box style={{ flexDirection: "row", flexShrink: 0 }}>
                      <Spinner color={selected ? theme.text : theme.brand} interval={120} />
                      <text content={`${op.label} `} fg={selected ? theme.text : theme.warn} wrapMode="none" />
                    </box>
                  ) : op?.status === "failed" ? (
                    <text content="op! " fg={selected ? theme.text : theme.bad} style={{ flexShrink: 0 }} />
                  ) : (
                    s.reboot_required && <text content="↻rbt " fg={selected ? theme.text : theme.warn} style={{ flexShrink: 0 }} />
                  )}
                  {s.upgrade_required && <text content="⬆upg " fg={selected ? theme.text : theme.warn} style={{ flexShrink: 0 }} />}
                  <text content={" " + count} fg={selected ? theme.text : theme.textFaint} style={{ flexShrink: 0 }} />
                </>
              )
            }}
          />
        </Panel>

        {/* Sites pane */}
        <Panel title={leftItem ? ` ${leftItem.kind === "server" ? "Sites" : "Projects"} · ${truncate(leftLabel, 20)} (${middleItems.length}) ` : " Sites "} active={focus === "sites"} flexGrow={1}>
          <List
            items={middleItems}
            selectedIndex={siteIndex}
            viewportRows={listRows}
            focused={focus === "sites"}
            keyFor={(item, i) => item.kind === "site" ? `w${item.site.id}` : `e${item.site.id}`}
            emptyText={isExternalLeft ? "No projects" : "No sites on this server"}
            renderRow={(item, selected) => {
              if (item.kind === "external") {
                const s = item.site
                return (
                  <>
                    <text content={providerTag(s.provider) + " "} fg={selected ? theme.text : theme.purple} style={{ flexShrink: 0 }} />
                    <text content={truncate(s.name, 40)} fg={selected ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1 }} />
                    <text content={truncate(s.stack ?? "—", 10)} fg={selected ? theme.text : theme.textFaint} wrapMode="none" style={{ flexShrink: 0 }} />
                    <text content={" " + s.status} fg={selected ? theme.text : statusColor(s.status)} wrapMode="none" style={{ flexShrink: 0 }} />
                  </>
                )
              }
              const s = item.site
              const updates = (s.wp_plugin_updates || 0) + (s.wp_theme_updates || 0) + (s.wp_core_update ? 1 : 0)
              const stack = classifyStack(s)
              return (
                <>
                  <text content={statusDot(s.status) + " "} fg={statusColor(s.status)} style={{ flexShrink: 0 }} />
                  <text content={truncate(s.domain, 40)} fg={selected ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1 }} />
                  <SiteMetaCell linked={localLinks.has(s.id)} updates={updates} selected={selected} />
                  <text content={stackTag(stack) + " "} fg={stackColor(stack, selected)} style={{ flexShrink: 0 }} />
                  <PhpVersionCell version={s.php_version} upgrade={phpUpgrades.get(s.id)} selected={selected} />
                </>
              )
            }}
          />
        </Panel>

        {/* Detail pane */}
        <Panel title=" Details " width={44}>
          {focus === "sites" && focusedItem ? (
            focusedItem.kind === "external" ? (
              <ExternalSiteDetail site={focusedItem.site} />
            ) : (
              <SiteDetail site={focusedItem.site} serverName={leftItem?.kind === "server" ? leftItem.server.name : "—"} />
            )
          ) : leftItem?.kind === "server" ? (
            <ServerDetail server={leftItem.server} siteCount={middleItems.length} />
          ) : leftItem?.kind === "provider" ? (
            <ProviderDetail inventory={leftItem.inventory} />
          ) : (
            <text content="No data" fg={theme.textFaint} />
          )}
        </Panel>
      </box>
      <SiteContextStrip site={focus === "sites" && focusedItem ? (focusedItem.kind === "site" ? focusedItem.site : focusedItem.site) : null} />
      <StatusBar hints={hints} message={flash ?? undefined} messageColor={theme.brand} />
    </box>
  )
}

// Detail panel for a provider entry (shown when a provider is selected in the
// left pane and the sites pane isn't focused).
function ProviderDetail({ inventory }: { inventory: ProviderInventory }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text content={truncate(inventory.account.label, 34)} fg={theme.text} attributes={1} wrapMode="none" />
      <text content={inventory.provider} fg={theme.accent} wrapMode="none" />
      <box style={{ height: 1 }} />
      <text content="Projects" fg={theme.textDim} />
      <text content={`  ${inventory.sites.length}`} fg={theme.text} />
      <text content="Deployments" fg={theme.textDim} />
      <text content={`  ${inventory.deployments.length}`} fg={theme.text} />
      <text content="Domains" fg={theme.textDim} />
      <text content={`  ${inventory.domains.length}`} fg={theme.text} />
    </box>
  )
}
