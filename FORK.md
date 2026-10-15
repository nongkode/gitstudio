# nongkode/gitstudio — fork notes (read with CLAUDE.md)

Fork of GitStudioHQ/gitstudio (Apache-2.0) by Nong Kode (nongkode). The owner
prefers short answers in Thai. Work happens on branch
**`extension-actions`**, kept as a few commits on top of upstream
`main` so it can be rebased or offered upstream. Every file the fork changes
carries a "Modified for the nongkode/gitstudio fork" note; keep LICENSE and
NOTICE as they are.

## What the fork adds: an extension point for other extensions

Other extensions declare, in their own package.json:

```jsonc
"contributes": {
  "gitstudio.actions": [{
    "id": "myext.export", "label": "Export", "icon": "cloud-download",
    "command": "myext.export",
    "slot": "commit",            // "noRepo" | "commit" | "toolbar"
    "when": ["hasRepo"],         // noRepo hasRepo hasChanges noChanges hasStaged clipboardHasGitUrl (all must hold)
    "style": "secondary", "order": 10, "tooltip": "…"
  }],
  "gitstudio.commitHandlers": [{ "command": "myext.beforeCommit" }]
}
```

- A button runs its command with `{repoRoot?, workspaceFolder?}`.
- A commit handler is called before `git commit` with
  `{repoRoot, message, amend, push}` and returns
  `{action: "continue"|"cancel", message?, push?}`; it may stage more files.
- Runtime API: `vscode.extensions.getExtension("gitstudio.gitstudio").exports.actions`
  -> `setState(id, {visible, badge, label, tooltip, disabled})`, `refresh()`.
- The clipboard is read only on window focus / view shown (never polled), and
  only when some button uses `clipboardHasGitUrl`.

Code:

- `apps/extension/src/contrib/extensionActions.ts` (new): scanning
  `vscode.extensions.all`, conditions, state, `beforeCommit`.
- `apps/extension/src/changes/commitView.ts`: slots
  `.ext-slot[data-slot=noRepo|commit|toolbar]`, messages `extActions` (to the
  page, `renderExtActions`) and `extAction` (from the page), `setFacts` after
  each state push, commit handlers in `doCommit` after `confirmCommitAll`.
- `apps/extension/src/extension.ts`: `GitStudioApi.actions`, `extensionActions.start()`.

Users of the extension point: Git Starter
(github.com/nongkode/Git-Studio---Plug-In---Starter) and TIA Portal Tools
(private). Keep the fork generic: nothing specific to one extension here.

## Build / install

`npm ci --ignore-scripts -w apps/extension --include-workspace-root`, then
`node scripts/fork-pack.js [outdir]`: stamps the version, runs `npm run
check-types`, `npm run package` and `npx @vscode/vsce package --no-dependencies`
in `apps/extension`, writes `gitstudio-<version>.vsix` and undoes the stamp.
(Full `npm ci` without `--ignore-scripts` pulls electron etc. for the desktop
app and is not needed for the extension.) Built OK on upstream ext 1.19.0
(upstream v2.6.0 7192ca7), check-types clean.

**Version of a fork build: `yy.mdd.hmm`** (Bangkok time, no leading zeros,
e.g. `26.1015.1251`), the same scheme as Git Starter and TIA Portal Tools. It
is always above the Marketplace version, so VS Code never replaces the fork
with the Marketplace build. Never build a release with upstream's version.
A GitHub Release of the fork: tag and title = that version, the vsix attached
(`gh release create <ver> <vsix> --repo nongkode/gitstudio`; always pass
`--repo`, the clone also knows upstream).

The extension id stays `gitstudio.gitstudio`: after installing the fork's vsix
keep **Auto Update off** for GitStudio (a vsix install is pinned already), or
the Marketplace build replaces it.

On the owner's PC: the clone in `C:\Users\VM\Desktop\VS Code Tools\`. Work only
there; other folders on the Desktop belong to other projects.

## Ideas not done yet

- Offer the extension point upstream (PR to GitStudioHQ/gitstudio) once it has
  been used for a while.
- Tests for `extensionActions.ts` (condition evaluation, `beforeCommit`
  cancel / message / push handling).
