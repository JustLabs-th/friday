# Friday UI

A personal desktop GUI for Codex, built with React, TypeScript, Vite, Tailwind CSS
and shadcn/ui (Base UI, Nova style). A Tauri shell shows the same UI as a desktop app.
The desktop app connects to `codex app-server` over local JSON-RPC/stdio. It reuses
the existing Codex login and configuration. The browser URL remains a UI preview;
use the native app for real agent work.

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

The app connects automatically, loads the engine's model/effort catalog, and
shows connection errors and a reconnect action in the chat area. If Codex needs
authentication, run `codex login` in a terminal first.

Engine selection, in order: `FRIDAY_CODEX_BIN`, this checkout's
`codex-rs/target/debug/codex` or `target/release/codex`, the installed Codex
application's Windows CLI, then `codex` on PATH. Windows uses `codex.exe`.
Set `FRIDAY_CODEX_BIN` explicitly to test a particular source-built engine:

```powershell
$env:FRIDAY_CODEX_BIN = 'E:\Projects\friday\codex-rs\target\debug\codex.exe'
pnpm.cmd ui:desktop
```

Connecting to an installed engine does not build the `codex-rs` workspace.

```powershell
pnpm.cmd ui:check
pnpm.cmd ui:build
```

Use `pnpm` instead of `pnpm.cmd` on macOS/Linux. This is an independent package, so
dependencies are installed with `--ignore-workspace`. Commit `pnpm-lock.yaml` with
dependency changes.

## Layout

- `src/app.tsx`: project metadata, selected session/model, and page layout.
- `src/lib/codex.ts`: connection state, transcript projection, live events, history,
  attachments, and approval responses. `useSyncExternalStore` shares one connection
  across React mounts and Strict Mode.
- `src/components/app-bar.tsx`: custom title bar. The Tauri window is frameless, so it
  provides dragging and the minimize / maximize / close buttons.
- `src/components/app-sidebar.tsx`: projects, each with its own sessions.
- `src/components/chat-view.tsx`, `prompt-input.tsx`, `model-selector.tsx`: chat area,
  composer (Enter sends, Shift+Enter adds a line) and model / effort pickers.
- `src/components/markdown.tsx`: renders assistant replies (GitHub-flavoured Markdown, highlighted code
  blocks with a copy button, tables). A fenced block tagged `chart` holding JSON becomes a chart; see
  `markdown-chart.tsx` for the shape (`type` is bar, line, area or pie). Open `/#gallery` to see every
  component and state.
- `src/components/new-project-dialog.tsx`: project name, prompt and a native folder picker
  (Tauri dialog plugin; the picker button is disabled in a plain browser).
- `src/components/settings-dialog.tsx`: settings popup; add a section by extending `sections`.
- `src/lib/models.ts`: model types and the gallery's fallback snapshot. The live
  chat picker uses `model/list` from the connected engine.
- `src/components/ui/`: shadcn primitives (add more with `pnpm dlx shadcn@4.23.0 add <name>`).
- `src-tauri/src/codex.rs`: native process lifecycle, initialize handshake,
  request/response routing, supported-method allowlist, and pending approvals.
- `src-tauri/`: Tauri shell. Window permissions are in `capabilities/default.json`.

Project metadata is saved locally under `friday.projects.v1`. Codex owns durable
threads/transcripts; Friday loads each project's history by working directory and
resumes the real thread ID. Renaming a session updates Codex. Removing a session
archives it; removing a project removes only Friday's project entry, without
deleting files or Codex history. The default project is this checkout on first run.

Command output, file changes, plans, model-provided reasoning summaries, and
one-time command/file approvals use real engine events. Raw reasoning content is
not displayed. Stop interrupts the real turn. Drafts remain editable while
disconnected and are cleared only when the send request is accepted. The app uses
workspace-write sandboxing and on-request approvals routed to the user; managed
engine policies still apply.

Attachments currently support UTF-8 text and images, up to 10 MB per file.
Unsupported interactive server requests (for example tool questionnaires) receive
an explicit error instead of hanging. Gallery data remains demonstrative and is
not loaded into normal chat. The terminal panel displays Codex command output;
it is not a separate interactive shell.

## Scheduled tasks

Open **Scheduled tasks** in the sidebar to create a task with a project, prompt,
five-field cron expression, IANA timezone, optional model/effort, and runtime limit.
The form previews the next three occurrences. Tasks can be edited, paused, run
immediately, stopped, or deleted. Open a run's session to read its full transcript
and respond to real Codex approval requests.

The Rust scheduler runs every two seconds independently of the current UI page.
Friday must remain open and the machine awake. Startup advances schedules to the
next future occurrence and marks unfinished runs interrupted; it never replays a
backlog. Occurrences more than one minute late are recorded as skipped. A busy
scheduled task/workspace or the four-run concurrency limit also skips an occurrence.
Manual Run now works on paused tasks and rejects duplicate active scheduled work.
The overlap guard covers scheduler runs, not manually started chat sessions.

Tasks and the latest 200 runs are saved atomically in
`scheduled-tasks-v1.json` in Tauri's application data directory. Invalid persisted
data is preserved and scheduling fails visibly. Output summaries are capped at
100 KB; the full session stays in Codex history. Removing a project from the
sidebar does not remove its schedules; pause/delete these separately.

Run `python ui/scripts/scheduler-smoke.py` with the development debug port below
to test real manual and minute-scheduled Codex runs, duplicate prevention, pause,
and history reload. It removes its temporary schedule and Friday run history.

## Native integration checks

For development testing only, launch with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9224`, then run:

```powershell
python -u -X utf8 ui/scripts/codex-smoke.py
python -u -X utf8 ui/scripts/codex-smoke.py --approval-only
python -u -X utf8 ui/scripts/codex-smoke.py --failure-only
```

These checks use Python `websockets` and the real desktop window/engine. They
exercise streaming, conversation context, text attachments, rename, history
resume, interruption, draft preservation, and one approval for a harmless
`Write-Output` command. They use a scratch workspace under `.artifacts/` and
restore the original project metadata. Do not enable the debug port for normal use.

`scripts/sidebar-smoke.py` was written for an earlier sidebar design and is out of date.
See [SHADCN-LICENSE.md](SHADCN-LICENSE.md) for the upstream component license.
