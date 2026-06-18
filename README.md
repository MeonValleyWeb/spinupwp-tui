# SpinupWP TUI

A fast, keyboard-driven terminal dashboard for browsing and monitoring your
[SpinupWP](https://spinupwp.com) servers and sites. Built with
[OpenTUI](https://opentui.com) and [Bun](https://bun.sh).

```
 ◆ SpinupWP   1 Dashboard   2 Servers   3 Search   4 Events    20 servers · 171 sites

 ┌──────────────┐ ┌───────────────┐ ┌───────────────────┐ ┌──────────────────────┐
 │ Servers      │ │ Sites         │ │ Fleet Disk        │ │ WP Updates           │
 │ 20           │ │ 171           │ │ 22%               │ │ 359                  │
 │ 20 connected │ │ 139 WordPress │ │ 616.3 GB / 2.8 TB │ │ 217 plugin · 67 core │
 └──────────────┘ └───────────────┘ └───────────────────┘ └──────────────────────┘
 ┌─ Disk usage by server ───────────────┐ ┌─ Needs attention (27) ──────────────┐
 │ web3.caseantiques.com  ██████░░░ 60% │ │ • hetzner2.wenmarkdigital.com — …   │
 │ web2.pickupmydonation  ██████░░░ 57% │ │ • web3.rockytopinsider.com — OS …   │
 └──────────────────────────────────────┘ └─────────────────────────────────────┘
```

## Features

- **Fleet dashboard** — at-a-glance health of every server: connection status,
  disk usage bars, pending reboots/OS upgrades, WordPress update counts, and a
  recent activity feed.
- **Server & site browser** — a three-pane navigator. Pick a server, see its
  sites, drill into full details (PHP version, HTTPS, page cache, backups, Git
  deployment, WP updates, and more).
- **Global search** — fuzzy search across every server and site at once by name,
  domain, or IP. Jump straight to anything.
- **Events feed** — recent provisioning and operation activity, with per-event
  detail and output.
- **Live server health** — press `h` on any server for a real-time view over
  SSH: CPU (aggregate + per-core + sparkline), load, memory/swap, disk mounts,
  and top processes. Polls every few seconds. (See "Server health" below.)
- **Open in browser** — press `o` on any site to open it in your default browser.

> The tool is **read-only** today (it works great with a Read Only API token).
> Write actions can be layered on later.

## Requirements

- [Bun](https://bun.sh) ≥ 1.3 (OpenTUI uses Bun's native FFI). Install with:
  ```sh
  curl -fsSL https://bun.sh/install | bash
  ```
- A SpinupWP API token — create one at
  [spinupwp.app/account/api](https://spinupwp.app/account/api/). **Read Only**
  scope is enough.

## Install & run

```sh
git clone <this-repo> spinupwp-tui
cd spinupwp-tui
bun install
bun run start
```

On first launch, if no token is configured you'll be guided through a short
onboarding flow that validates your token and saves it locally.

### Run `spinup` from anywhere

Install the `spinup` command globally with a symlink to this checkout (updates as
you pull):

```sh
bun run link-global      # = bun link; creates `spinup` on your PATH
spinup login             # save your API token to the config file (once)
spinup                   # launch from any directory
```

`spinup login` is what makes it work outside the project: the project `.env` is
only read from the project directory, so the global command relies on the token
saved in the config file. (Run `bun run unlink-global` to remove the command.)

For a standalone binary that doesn't need Bun on `PATH` at runtime:

```sh
bun run build:binary     # produces ./spinup — move it onto your PATH
```

#### CLI subcommands

```
spinup            Launch the dashboard
spinup login      Set or update your saved API token
spinup where      Show the config path and which source the token came from
spinup --version  Print the version
spinup --help     Show help
```

## Configuration

The token is resolved in this order (first match wins):

1. **`SPINUPWP_ACCESS_TOKEN`** environment variable. Bun automatically loads a
   `.env` file from the working directory, so a project-local `.env` works:
   ```sh
   # .env
   SPINUPWP_ACCESS_TOKEN=your-token-here
   ```
2. **`~/.config/spinupwp-tui/config.json`** — written by the onboarding wizard.
   Respects `XDG_CONFIG_HOME`.

To reconfigure, delete the config file (the path is shown on the onboarding
screen) and relaunch, or set the environment variable.

## Keybindings

| Key | Action |
| --- | --- |
| `1` `2` `3` `4` | Switch tabs: Dashboard · Servers · Search · Events |
| `↑`/`↓` or `j`/`k` | Move selection |
| `Enter` / `→` | Drill in (server → its sites) |
| `←` / `Esc` | Go back / collapse |
| `Tab` | Switch focus between columns |
| `g` / `G` | Jump to top / bottom |
| `o` | Open the selected site in your browser |
| `h` | Live server health (CPU/mem/disk over SSH) |
| `/` | Jump to global search |
| `r` | Refresh data from the API |
| `?` | Toggle the help overlay |
| `q` / `Ctrl+C` | Quit |

## Server health (SSH)

The SpinupWP API exposes no live metrics, so the health view (`h` in the
Servers tab) reaches the server directly over SSH using **your local SSH keys /
agent** — the same way you'd `ssh in` and run `htop`. It runs a single batched,
**read-only** command (`cat /proc/*`, `df`, `ps`) and renders the result.

- **Connection target** is derived from the API: it connects as one of the
  server's `site_user`s at the server's IP (`site_user@ip`). No extra config
  needed if `ssh site_user@ip` already works from your terminal.
- **Non-interactive:** it uses `BatchMode=yes`, so if key auth isn't already set
  up it fails fast with a hint rather than prompting for a password.
- **Override the SSH user** (e.g. to use `root` or a sudo user) with the
  `SPINUPWP_SSH_USER` environment variable, or `"sshUser"` in the config file.
- A persistent `ControlMaster` connection keeps repeated polls fast.

Nothing is ever written to the server.

## Development

```sh
bun run dev          # run from source
bun run typecheck    # tsc --noEmit
```

### Project layout

```
src/
  index.tsx          entry — boots OpenTUI, routes onboarding vs app
  config.ts          token resolution + persistence
  api/
    client.ts        typed fetch client (pagination, errors, validation)
    types.ts         Server / Site / Event types
  lib/               formatting, theme, open-in-browser helpers
  ui/
    App.tsx          shell: splash gating, key routing, layout
    store.tsx        React-context data store
    Splash / Onboarding / Header / StatusBar / Help
    List.tsx         generic windowed keyboard list
    Details.tsx      shared server/site detail panels
    views/           Dashboard, Browser, Search, Events
```

## License

MIT — see [LICENSE](LICENSE).
