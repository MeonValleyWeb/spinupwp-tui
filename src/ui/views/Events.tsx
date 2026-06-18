// Events feed: recent provisioning/operation activity across the account.
// Left pane lists events; right pane shows the selected event's detail + output.

import { useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme, statusColor, statusDot } from "../../lib/theme.ts"
import { truncate, timeAgo, formatDate } from "../../lib/format.ts"
import { Panel, Field } from "../components.tsx"
import { List, moveSelection } from "../List.tsx"
import { StatusBar } from "../StatusBar.tsx"
import { useStore } from "../store.tsx"

export function Events({ rows }: { rows: number }) {
  const store = useStore()
  const { events, serverById, route, inputMode, overlayOpen } = store
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(0, events.length - 1)))
  }, [events.length])

  const isActive = route === "events" && !inputMode && !overlayOpen

  useKeyboard((key) => {
    if (!isActive) return
    switch (key.name) {
      case "up":
      case "k":
        return setSelected((i) => moveSelection(i, -1, events.length))
      case "down":
      case "j":
        return setSelected((i) => moveSelection(i, 1, events.length))
      case "g":
        return setSelected(0)
      case "G":
        return setSelected(events.length - 1)
    }
  })

  const current = events[Math.min(selected, Math.max(0, events.length - 1))]
  const outputLines = useMemo(() => (current?.output ? current.output.split("\n") : []), [current])
  const listRows = Math.max(3, rows - 4)

  return (
    <box style={{ flexGrow: 1, flexDirection: "column" }}>
      <box style={{ flexGrow: 1, flexDirection: "row", padding: 1, gap: 1 }}>
        <Panel title={` Events (${events.length}) `} active flexGrow={1}>
          <List
            items={events}
            selectedIndex={selected}
            viewportRows={listRows}
            focused
            emptyText="No recent events"
            keyFor={(e) => e.id}
            renderRow={(e, sel) => (
              <>
                <text content={statusDot(e.status) + " "} fg={statusColor(e.status)} style={{ flexShrink: 0 }} />
                <text content={truncate(e.name, 56)} fg={sel ? theme.text : theme.textDim} wrapMode="none" style={{ flexGrow: 1, flexShrink: 1 }} />
                <text content={" " + timeAgo(e.created_at)} fg={theme.textFaint} style={{ flexShrink: 0 }} />
              </>
            )}
          />
        </Panel>

        <Panel title=" Event detail " width={46}>
          {current ? (
            <box style={{ flexDirection: "column" }}>
              <text content={truncate(current.name, 46)} fg={theme.text} attributes={1} />
              <box style={{ height: 1 }} />
              <Field label="Status" value={current.status} valueColor={statusColor(current.status)} labelWidth={12} />
              <Field label="Server" value={serverById(current.server_id)?.name ?? "—"} labelWidth={12} />
              <Field label="By" value={current.initiated_by ?? "—"} labelWidth={12} />
              <Field label="Created" value={formatDate(current.created_at)} labelWidth={12} />
              <Field label="Finished" value={current.finished_at ? formatDate(current.finished_at) : "—"} labelWidth={12} />
              <box style={{ height: 1 }} />
              <text content="Output" fg={theme.accent} />
              {outputLines.length === 0 ? (
                <text content="(no output)" fg={theme.textFaint} />
              ) : (
                outputLines.slice(0, Math.max(1, rows - 14)).map((line, i) => (
                  <text key={i} content={truncate(line, 46)} fg={theme.textDim} />
                ))
              )}
            </box>
          ) : (
            <text content="No event selected" fg={theme.textFaint} />
          )}
        </Panel>
      </box>
      <StatusBar
        hints={[
          { key: "↑↓/jk", label: "select" },
          { key: "g/G", label: "top/bottom" },
        ]}
      />
    </box>
  )
}
