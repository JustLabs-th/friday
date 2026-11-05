# Friday UI

A personal desktop GUI for Codex, built with React, TypeScript, Vite, Tailwind CSS
and shadcn/ui (Base UI, Nova style). A Tauri shell shows the same UI as a desktop app.
The Rust Codex engine lives in `../codex-rs`; this UI is **not connected to it yet**,
so sending a message does not produce a reply.

## Run

From the repository root in Windows PowerShell:

```powershell
pnpm.cmd ui:install
pnpm.cmd ui:dev
```

Open http://127.0.0.1:5173. Changes update automatically.

To open the native Tauri window:

```powershell
pnpm.cmd ui:desktop
```

The launcher reuses the running dev server or starts it, and finds the existing
Visual Studio / Windows SDK library paths for its child process. Rust and the
platform Tauri prerequisites must already be installed.

```powershell
pnpm.cmd ui:check
pnpm.cmd ui:build
```

Use `pnpm` instead of `pnpm.cmd` on macOS/Linux. This is an independent package, so
dependencies are installed with `--ignore-workspace`. Commit `pnpm-lock.yaml` with
dependency changes.

## Layout

- `src/app.tsx`: app state (projects, sessions, messages, selected model) and page layout.
- `src/components/app-bar.tsx`: custom title bar. The Tauri window is frameless, so it
  provides dragging and the minimize / maximize / close buttons.
- `src/components/app-sidebar.tsx`: projects, each with its own sessions.
- `src/components/chat-view.tsx`, `prompt-input.tsx`, `model-selector.tsx`: chat area,
  composer (Enter sends, Shift+Enter adds a line) and model / effort pickers.
- `src/components/new-project-dialog.tsx`: project name, prompt and a native folder picker
  (Tauri dialog plugin; the picker button is disabled in a plain browser).
- `src/components/settings-dialog.tsx`: settings popup; add a section by extending `sections`.
- `src/lib/models.ts`: snapshot of the selectable models from
  `codex-rs/models-manager/models.json`. Regenerate it when that file changes.
- `src/components/ui/`: shadcn primitives (add more with `pnpm dlx shadcn@4.23.0 add <name>`).
- `src-tauri/`: Tauri shell. Window permissions are in `capabilities/default.json`.

All project, session and message data is held in memory and is lost on reload.
`scripts/sidebar-smoke.py` was written for an earlier sidebar design and is out of date.
See [SHADCN-LICENSE.md](SHADCN-LICENSE.md) for the upstream component license.
