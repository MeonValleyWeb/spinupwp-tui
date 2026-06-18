# Release process

How changes get from a working tree to a published release. Following this end to
end is the default — no need to ask which files to touch; they're all listed here.

## Branching & merge policy

- **Code changes** → feature branch off `main` (`feat/…`, `fix/…`), then a **PR**,
  then **squash-merge** to `main` (delete the branch). This keeps `main` at one
  tidy commit per feature and gives each feature a durable PR artifact (the *why*,
  testing notes, decisions) — worth it now that the app makes write calls to live
  infrastructure.
- **Docs / chore only** (CHANGELOG, README, this file, version bumps) → may be
  committed **directly to `main`**; no branch/PR required.
- Never let **client domains** appear in any public artifact — commit messages,
  PR titles/bodies, release notes, code, or docs. Anonymize (e.g. "a production
  site", `web3.example.com`).
- Outward-facing, hard-to-reverse steps (pushing, merging, publishing a release)
  and anything that could touch a production site are confirmed with the user
  before running. Routine file edits are not.

## Keep the changelog current (during development)

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com). As changes
land, add bullets under `## [Unreleased]` in the right group: **Added / Changed /
Fixed / Removed** (plus **Notes** for caveats). Write user-facing impact, not
implementation detail.

## Versioning (SemVer, while in `0.x`)

- New user-facing feature → **minor** bump (`0.2.0` → `0.3.0`).
- Bug-fix / docs only → **patch** bump (`0.3.0` → `0.3.1`).
- The version lives in `package.json` (the app reads `pkg.version`).

## Cutting a release

Run these in order. Replace `X.Y.Z` with the new version.

1. **Land the work.** Feature branch merged to `main` (or docs committed directly).
   `bun run typecheck` is green.
2. **Bump the version** in `package.json`.
3. **Roll the changelog:** rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`,
   add a fresh empty `## [Unreleased]` above it, and update the compare links at
   the bottom:
   ```
   [Unreleased]: https://github.com/mwender/spinupwp-tui/compare/vX.Y.Z...HEAD
   [X.Y.Z]:      https://github.com/mwender/spinupwp-tui/compare/vPREV...vX.Y.Z
   ```
   (Do the version bump + changelog roll *before* tagging so the tagged commit
   carries them.)
4. **Commit** the bump + changelog (`chore: release vX.Y.Z`) and get it onto
   `main` (direct, or as part of the feature PR).
5. **Tag** an annotated tag on `main` and push it:
   ```sh
   git checkout main && git pull --ff-only
   git tag -a vX.Y.Z -m "vX.Y.Z — <short theme>"
   git push origin vX.Y.Z
   ```
6. **Publish the GitHub release** matching the house style of prior releases
   (`gh release view v0.2.0` for reference):
   ```sh
   gh release create vX.Y.Z --verify-tag \
     --title "vX.Y.Z — <short theme>" \
     --notes "<intro line>

   ## Highlights
   - …

   ## Notes
   - …

   **Update:** \`git pull\` in your checkout (the global \`spinup\` symlink picks it up immediately).

   **Full changelog:** https://github.com/mwender/spinupwp-tui/compare/vPREV...vX.Y.Z"
   ```
   - Title: `vX.Y.Z — <short theme>` (e.g. "Upgrade PHP versions (first write action)").
   - Body: short intro, `## Highlights` (bold lead-ins, key bindings in backticks),
     optional `## Fixed` / `## Notes`, the **Update** line, and the **Full
     changelog** compare link. Keep it anonymized.

## Quick checklist

- [ ] Work merged to `main`, `bun run typecheck` green
- [ ] `package.json` version bumped (SemVer)
- [ ] `CHANGELOG.md`: `[Unreleased]` → `[X.Y.Z]` + date, fresh `[Unreleased]`, compare links updated
- [ ] Release commit on `main`
- [ ] `vX.Y.Z` annotated tag pushed
- [ ] GitHub release published in house style
- [ ] No client domains anywhere
