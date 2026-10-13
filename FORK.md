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

`npm ci --ignore-scripts -w apps/extension --include-workspace-root`, then in
`apps/extension`: `npm run check-types`, `npm run package`,
`npx @vscode/vsce package --no-dependencies`. (Full `npm ci` without
`--ignore-scripts` pulls electron etc. for the desktop app and is not needed
for the extension.) Built OK (ext 1.19.0, upstream v2.6.0 7192ca7), check-types clean.

The extension id stays `gitstudio.gitstudio`: after installing the fork's vsix
keep **Auto Update off** for GitStudio (a vsix install is pinned already), or
the Marketplace build replaces it.

On the owner's PC: the `GitStudio fork\` folder in the owner's tools folder
(`patches\*.patch` = the fork commits, `build.bat`, `push.bat` with logs).
`push.bat` resets the branch to `origin/main` + the patches and force-pushes,
so commit changes as patches there or push from a clone and refresh the
patches with `git format-patch origin/main`.

## Ideas not done yet

- Offer the extension point upstream (PR to GitStudioHQ/gitstudio) once it has
  been used for a while.
- Tests for `extensionActions.ts` (condition evaluation, `beforeCommit`
  cancel / message / push handling).
