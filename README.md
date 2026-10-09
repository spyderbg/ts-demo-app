# GDA Sync

A working Linux and Windows demo of the architecture in [the specification](docs/node_app.md): React + TypeScript, a local Fastify backend, and a standalone launcher that opens the browser.

## Launch the finished application

The standalone executables are in `dist/`:

| Platform | Executable | Launch |
| --- | --- | --- |
| Linux x64 | `dist/gda-sync` | `./dist/gda-sync` |
| Windows x64 | `dist/gda-sync.exe` | Double-click, or `.\dist\gda-sync.exe` in PowerShell |

On Linux:

```bash
./dist/gda-sync
```

On Windows:

```powershell
.\dist\gda-sync.exe
```

Both start the backend on **http://127.0.0.1:5175** and open your default browser. Node.js and npm are not required on the end user’s machine. Each executable bundles the frontend, fonts, backend, demo assets generator, and the appropriate Node runtime. Linux uses `xdg-open` for browser/file-manager integration; Windows uses PowerShell's `Start-Process` with the target passed as environment data. The Windows executable is unsigned and uses a console window that closes when the backend exits.

To add **GDA Sync** to your Ubuntu application menu and `~/.local/bin`:

```bash
./scripts/install-desktop.sh
```

The Linux installer works entirely in your user account, with no `sudo`. The Windows executable can run from any folder without installation. On both platforms, closing the last GDA Sync page stops the backend after a two-second grace period. Refreshing reconnects during that grace period, and another open GDA Sync tab keeps the app running. Switching tabs or minimizing the browser keeps it running. Active file copies finish before shutdown. You can also use Workspace settings → Stop application to quit immediately.

## Try the demo

The first launch creates the **Verdant** workspace with 18 real sample files: textures, DDS maps, OBJ models, materials, and audio. Five assets are new, three are modified, and ten are already in sync.

- Search names and folder paths; filter by type, format, or status.
- Switch between grid and list views; sort by name, size, or modification time.
- Click an asset to inspect its metadata and enlarge its preview.
- Select assets and choose **Sync selected**, sync an individual asset, or **Sync all pending**.
- Review the files and destination in the sync dialog, then confirm the copy.
- Use **Rescan** after editing a source file to recompute its sync status and retry any failed previews.
- Open the source or GDA folder in your file manager, or copy its full path.
- Review persisted sync activity, including the individual files copied.
- Connect your own existing source and GDA folders under **Workspace settings**.

`Ctrl+K` (or `⌘K`) focuses search; `Esc` closes dialogs. Fonts and sample previews are bundled, so the application works offline.

## File behavior

Sync is one-way: source → GDA. Relative subfolders and original file bytes are preserved. File size and SHA-256 contents determine whether a destination matches. Copies use temporary files in the destination folder and an atomic rename. Source changes during copying are rejected. Existing destination files are backed up before replacement. Source files and extra GDA files are never deleted.

Configuration, history, demo files, and backups use these default data directories:

- Linux: `${XDG_DATA_HOME:-~/.local/share}/gda-sync/`
- Windows: `%LOCALAPPDATA%\GDA Sync\` (normally `C:\Users\<user>\AppData\Local\GDA Sync\`)

Both use this layout:

```text
<app-data>/
├── workspace.json
├── activity.json
├── demo/source/
├── demo/gda/
└── backups/<sync-id>/<relative-file-path>
```

The exact backup directory is displayed in settings. To restore a previous GDA version, copy the corresponding backup file back into the same relative location in your GDA folder. Set `GDA_SYNC_HOME` to use a different app data directory. Source and destination must be existing, separate folders; nested roots and symbolic links are rejected or skipped. Hidden files/folders are skipped. The demo supports up to 10,000 files per workspace.

DDS previews decode the first surface and mip of **DXT1, DXT3, DXT5, RGB24, RGB32, and DX10 BC7 (UNORM / sRGB)**. Other DDS formats remain available for syncing, with a clear preview-unavailable message. DDS previews are limited to 16 megapixels, and all previews to 64 MB. Demo model thumbnails are illustrations; arbitrary 3D files are copied but not rendered. Material/audio files use type thumbnails.

The server binds only to loopback. Write operations require a per-process session token; foreign hosts and cross-site browser requests are rejected. This is an app for a trusted local desktop, with no account or cloud service.

## Development

Requires Node.js 22.12+ (Node 24 recommended) and npm.

```bash
npm ci
npm run dev          # React development server + Fastify, browser opens automatically
npm run typecheck
npm test             # Filesystem, sync, API, and DDS tests
npm run build        # Compile and embed the frontend in build/server.cjs
npm start            # Launch the production server and open the browser
npm run package      # Linux: build both executables; Windows: build the .exe
npm run package:linux   # Build dist/gda-sync on Linux
npm run package:windows # Build dist/gda-sync.exe on Linux or Windows
```

`stopOnPageClose` defaults to `false`: development and ordinary builds keep the backend running when the page closes. The `package`, `package:linux`, and `package:windows` commands build the dist executables with `--stop-on-page-close=true`. To enable this for an ordinary build, use `npm run build -- --stop-on-page-close=true`. The launch parameter `--stop-on-page-close=true` or `--stop-on-page-close=false` overrides the built-in default; manual Stop application remains available in either mode.

For browser tests, install Chromium once:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Browser tests use an isolated temporary workspace and remove it after completion. They verify offline rendering, search/filtering, DDS previews, mobile layout, configuration, selected sync, full sync, persistence, and application shutdown. Screenshots are written to `build/preview-desktop.png` and `build/preview-mobile.png`.

After packaging, test the executables themselves:

```bash
npm run test:package          # Native executable on the current OS
npm run test:package:windows  # Windows executable; uses Wine when run on Linux
```

These checks use isolated app-data directories and verify demo/model/BC7 previews, sync and backups, persistence, refresh, and automatic process exit on page close. Windows verification on this development machine uses Wine; a native Windows desktop check is still recommended before distribution.

Useful launch options:

```bash
./dist/gda-sync --no-open
./dist/gda-sync --stop-on-page-close=false
GDA_SYNC_HOME=/path/to/app-data ./dist/gda-sync
PORT=4567 ./dist/gda-sync
GDA_SYNC_NO_OPEN=1 npm run dev
```

Launching a second instance reopens the running app on the same port. If another application occupies the port, GDA Sync exits with an explanation. `PORT` applies to production; the development proxy expects the backend on 5175.

On Windows, set environment overrides in PowerShell:

```powershell
$env:GDA_SYNC_HOME = 'D:\GDA Sync Data'
$env:PORT = '4567'
.\dist\gda-sync.exe --no-open
```

Windows packaging uses an x64 Node runtime of exactly the version used to generate the SEA blob. On Linux it downloads that runtime from `nodejs.org`, verifies its SHA-256 against the official release checksums, and caches it under `build/runtimes/`. Subsequent builds can reuse the verified cache offline. On Windows with x64 Node installed, it uses the current Node executable. Linux packaging uses the current Linux Node executable and must run on Linux. Both snapshot and code caching are disabled for cross-platform blob compatibility. No Windows SDK or Wine is needed to build the `.exe`; Wine is used here only for runtime verification.

## Structure

```text
backend/         Local API, filesystem sync, demo generator, DDS decoder
frontend/        React application, styles, and bundled icon
scripts/         Development, build, native packaging, desktop installation
config/          Example persisted workspace configuration
tests/          Core tests and browser workflow tests
build/           Generated frontend, bundled backend, screenshots
dist/           Generated standalone Linux and Windows executables
```

Packaging follows the [Node single-executable application workflow](https://nodejs.org/download/release/v24.14.0/docs/api/single-executable-applications.html). DDS decoding follows Microsoft's [DDS header](https://learn.microsoft.com/en-us/windows/win32/direct3ddds/dds-header) and [block-compression](https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-resources-block-compression) documentation.

The BC7 decoder and partition tables are adapted from [bcdec](https://github.com/iOrange/bcdec) under the MIT license. Its copyright and license are retained in `backend/bc7.ts` and the bundled application. Regression vectors cover all eight BC7 modes, all partition patterns, channel rotations, and index selectors.

Version 1.0.1 also retries failed thumbnails on Rescan, renews the local session after a server restart, and shows DDS images in full over a transparency grid with their original colors. HTML and frontend assets are served without caching to avoid retaining an older application build.

Version 1.0.2 ties the backend lifetime to open app pages using an authenticated event stream. The backend waits for the first page to connect, so `--no-open` can be used before manually opening the app. Closing or navigating away from the last app page triggers shutdown; a refresh cancels it if the page reconnects within two seconds. Shutdown waits for active workspace operations before exiting, including copies whose browser requests have disconnected.

Version 1.1.0 adds Windows x64 packaging, Windows app-data paths, literal browser/folder launching, and portable asset IDs so demo model previews also load on Windows.
