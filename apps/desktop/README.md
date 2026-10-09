# @mct/desktop — MCT Diff Studio for Windows (Electron)

Native Windows shell around the same React app and the same engine packages as
the web build. No engine code is forked: the renderer loads `../web/dist` verbatim.

## Layout

- `src/main.ts` — main process: window lifecycle, native open/save dialogs via
  validated IPC (`mct:openFile`, `mct:saveFile`, `mct:appVersion`). No remote
  content is ever loaded in production; external links open in the system browser.
- `src/preload.ts` — context-isolated bridge exposing `window.mctDesktop`.
- `electron-builder.yml` — NSIS installer + portable `.exe` for win-x64.
- `web-dist/` (build artefact, git-ignored) — copy of `apps/web/dist`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm --workspace @mct/desktop run build` | Compile main + preload to `dist/` |
| `npm --workspace @mct/desktop run typecheck` | Typecheck only |
| `npm --workspace @mct/desktop run dev` | Build, then launch Electron against `MCT_DESKTOP_URL` (dev server) or `web-dist/` |
| `npm --workspace @mct/desktop run dist` | Build + package installer/portable into `release/` |

The `dist` script expects `web-dist/` to be populated first:

```powershell
npm --workspace @mct/web run build
Remove-Item -Recurse -Force apps/desktop/web-dist
Copy-Item -Recurse apps/web/dist apps/desktop/web-dist
npm --workspace @mct/desktop run dist
```

## Sandbox note

`npm install` inside restricted sandboxes must set
`ELECTRON_SKIP_BINARY_DOWNLOAD=1` (the Electron binary CDN is unreachable).
Packaging requires a full install on a Windows or CI runner — see
`.github/workflows/release.yml`.
