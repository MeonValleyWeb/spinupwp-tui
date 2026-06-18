// Fleet composition: site stacks (Tier-1 classification) + PHP version spread.
//
// Left pane lists the stack buckets with counts/bars (selectable); the middle
// pane drills into the sites of the selected stack; the right pane shows the
// fleet-wide PHP version distribution with end-of-life versions flagged.
//
// Like the Browser, focus moves rightward with Tab/→ and back with ←/Esc.

import { useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme, statusColor, statusDot } from "../../lib/theme.ts"
import { bar, truncate } from "../../lib/format.ts"
import { STACKS, classifyStack, stackColor, isPhpEol, phpSortKey, type Stack } from "../../lib/stack.ts"
import { probeKindColor } from "../../lib/probe.ts"
import { Panel, Spinner } from "../components.tsx"
import { List, moveSelection } from "../List.tsx"
import { StatusBar } from "../StatusBar.tsx"
import { openUrl } from "../../lib/open.ts"
import { useStore } from "../store.tsx"
import type { Site } from "../../api/types.ts"

type Focus = "stacks" | "sites"

export function Stacks({ rows }: { rows: number }) {
  const store = useStore()
  const { sites, serverById, route, inputMode, overlayOpen, probes, probingIds, probeErrors, runProbe, isProbeStale } =
    store

  const [stackIndex, setStackIndex] = useState(0)
  const [siteIndex, setSiteIndex] = useState(0)
  const [focus, setFocus] = useState<Focus>("stacks")
  const [flash, setFlash] = useState<string | null>(null)

  // Classify every site once; derive bucket counts and the PHP histogram.
  const { counts, byStack, php } = useMemo(() => {
    const counts = new Map<Stack, number>(STACKS.map((s) => [s, 0]))
    const byStack = new Map<Stack, Site[]>(STACKS.map((s) => [s, []]))
    const phpCounts = new Map<string, number>()
    for (const site of sites) {
      const st = classifyStack(site)
      counts.set(st, (counts.get(st) ?? 0) + 1)
      byStack.get(st)!.push(site)
      const v = site.php_version ?? "—"
      phpCounts.set(v, (phpCounts.get(v) ?? 0) + 1)
    }
    for (const list of byStack.values()) list.sort((a, b) => a.domain.localeCompare(b.domain))
    const php = [...phpCounts.entries()].sort((a, b) => phpSortKey(b[0]) - phpSortKey(a[0]))
    return { counts, byStack, php }
  }, [sites])

  const selectedStack = STACKS[stackIndex]
  const stackSites = byStack.get(selectedStack) ?? []
  const total = sites.length || 1

  // Reset the site selection whenever the active stack changes.
  useEffect(() => {
    setSiteIndex(0)
  }, [stackIndex])

  const isActive = route === "stacks" && !inputMode && !overlayOpen

  useKeyboard((key) => {
    if (!isActive) return

    const moveBy = (delta: number) => {
      if (focus === "stacks") setStackIndex((i) => moveSelection(i, delta, STACKS.length))
      else setSiteIndex((i) => moveSelection(i, delta, stackSites.length))
    }

    switch (key.name) {
      case "up":
      case "k":
        return moveBy(-1)
      case "down":
      case "j":
        return moveBy(1)
      case "g":
        return focus === "stacks" ? setStackIndex(0) : setSiteIndex(0)
      case "G":
        return focus === "stacks" ? setStackIndex(STACKS.length - 1) : setSiteIndex(stackSites.length - 1)
      case "right":
      case "l":
      case "return":
      case "tab":
        if (focus === "stacks" && stackSites.length > 0) setFocus("sites")
        return
      case "left":
      case "escape":
        if (focus === "sites") setFocus("stacks")
        return
      case "o":
        if (focus === "sites" && stackSites[siteIndex]) {
          const s = stackSites[siteIndex]
          openUrl((s.https?.enabled ? "https://" : "http://") + s.domain)
          setFlash(`Opening ${s.domain}…`)
          setTimeout(() => setFlash(null), 1500)
        }
        return
      case "d":
        // Detect: SSH-probe the selected site's actual stack (Tier 2).
        if (focus === "sites" && stackSites[siteIndex]) {
          const s = stackSites[siteIndex]
          runProbe(s)
          setFlash(`Probing ${s.domain}…`)
          setTimeout(() => setFlash(null), 1500)
        }
        return
    }
  })

  const listRows = Math.max(3, rows - 6)
  const maxPhp = Math.max(1, ...php.map(([, n]) => n))

  const hints =
    focus === "stacks"
      ? [
          { key: "↑↓/jk", label: "select" },
          { key: "→/⏎", label: "view sites" },
        ]
      : [
          { key: "↑↓/jk", label: "select site" },
          { key: "←/esc", label: "back" },
          { key: "d", label: "detect stack" },
          { key: "o", label: "open" },
        ]

  // Prefer a transient flash; otherwise surface the selected site's probe error.
  const selectedSite = focus === "sites" ? stackSites[siteIndex] : undefined
  const selectedError = selectedSite ? probeErrors.get(selectedSite.id) : undefined
  const statusMessage = flash ?? (selectedError ? `⚠ ${selectedError}` : undefined)
  const statusColorMsg = flash ? theme.brand : theme.bad

  return (
    <box style={{ flexGrow: 1, flexDirection: "column" }}>
      <box style={{ flexGrow: 1, flexDirection: "row", padding: 1, gap: 1 }}>
        {/* Stack composition */}
        <Panel title={` Stacks (${sites.length}) `} active={focus === "stacks"} width={36}>
          <box style={{ flexGrow: 1, flexDirection: "column" }}>
            {STACKS.map((st, i) => {
              const n = counts.get(st) ?? 0
              const frac = n / total
              const selected = i === stackIndex
              return (
                <box
                  key={st}
                  style={{
                    flexDirection: "row",
                    height: 1,
                    backgroundColor: selected ? (focus === "stacks" ? theme.selectedBg : theme.bgAlt) : undefined,
                  }}
                >
                  <text content={st.padEnd(12)} fg={stackColor(st)} wrapMode="none" style={{ flexShrink: 0 }} />
                  <text content={bar(frac, 8)} fg={stackColor(st)} style={{ flexShrink: 0 }} />
                  <text content={String(n).padStart(4)} fg={theme.text} style={{ flexShrink: 0 }} />
                  <text content={`${(frac * 100).toFixed(0)}%`.padStart(5)} fg={theme.textFaint} style={{ flexShrink: 0 }} />
                </box>
              )
            })}
          </box>
        </Panel>

        {/* Sites in the selected stack */}
        <Panel title={` ${selectedStack} · sites (${stackSites.length}) `} active={focus === "sites"} flexGrow={1}>
          <List
            items={stackSites}
            selectedIndex={siteIndex}
            viewportRows={listRows}
            focused={focus === "sites"}
            keyFor={(s) => s.id}
            emptyText="No sites in this stack"
            renderRow={(s, selected) => {
              const cached = probes.get(s.id)
              const probing = probingIds.has(s.id)
              const errored = probeErrors.has(s.id)
              // On the focused selection (bright-green bg) faint text is illegible,
              // so brighten the secondary cells when the row is selected.
              const faint = selected ? theme.text : theme.textFaint
              return (
                <>
                  <text content={statusDot(s.status) + " "} fg={statusColor(s.status)} style={{ flexShrink: 0 }} />
                  <text
                    content={truncate(s.domain, 40)}
                    fg={selected ? theme.text : theme.textDim}
                    wrapMode="none"
                    style={{ flexGrow: 1, flexShrink: 1 }}
                  />
                  {/* Tier-2 detected stack (or status of the probe). */}
                  <box style={{ flexShrink: 0, flexDirection: "row", marginLeft: 1 }}>
                    {probing ? (
                      <Spinner color={selected ? theme.text : theme.brand} />
                    ) : cached ? (
                      <text
                        content={truncate(cached.result.label, 20) + (isProbeStale(s) ? "*" : "")}
                        fg={probeKindColor(cached.result.kind, selected)}
                        wrapMode="none"
                      />
                    ) : errored ? (
                      <text content="probe failed" fg={selected ? theme.text : theme.bad} wrapMode="none" />
                    ) : (
                      <text content="· press d" fg={faint} wrapMode="none" />
                    )}
                  </box>
                  <text
                    content={truncate(serverById(s.server_id)?.name ?? "", 16)}
                    fg={faint}
                    wrapMode="none"
                    style={{ flexShrink: 0, marginLeft: 1 }}
                  />
                  <text
                    content={" " + (s.php_version ?? "—")}
                    fg={isPhpEol(s.php_version) ? theme.bad : faint}
                    style={{ flexShrink: 0 }}
                  />
                </>
              )
            }}
          />
        </Panel>

        {/* PHP version distribution (fleet-wide) */}
        <Panel title=" PHP versions " width={30}>
          <box style={{ flexGrow: 1, flexDirection: "column" }}>
            {php.map(([v, n]) => {
              const eol = isPhpEol(v)
              return (
                <box key={v} style={{ flexDirection: "row", height: 1 }}>
                  <text content={v.padEnd(6)} fg={eol ? theme.bad : theme.text} style={{ flexShrink: 0 }} />
                  <text content={bar(n / maxPhp, 8)} fg={eol ? theme.bad : theme.brandDim} style={{ flexShrink: 0 }} />
                  <text content={String(n).padStart(4)} fg={theme.textDim} style={{ flexShrink: 0 }} />
                  <text content={eol ? " EOL" : ""} fg={theme.bad} style={{ flexShrink: 0 }} />
                </box>
              )
            })}
          </box>
        </Panel>
      </box>
      <StatusBar hints={hints} message={statusMessage} messageColor={statusColorMsg} />
    </box>
  )
}
