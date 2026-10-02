# GDA Sync

A working Ubuntu-focused demo of the architecture in [the specification](docs/node_app.md): React + TypeScript, a local Fastify backend, and a standalone launcher that opens the browser.

## Launch the finished application

The built Linux x64 executable is ready in `dist/gda-sync`:

```bash
./dist/gda-sync
```

It starts the backend on **http://127.0.0.1:3456** and opens your default browser. Node.js and npm are not required on the end user’s machine. The binary bundles the frontend, fonts, backend, demo assets generator, and Node runtime. It still uses standard Linux system libraries and `xdg-open` for browser/file-manager integration. Build on the OS/architecture you intend to distribute to; the current artifact is Linux x64.

To add **GDA Sync** to your Ubuntu application menu and `~/.local/bin`:

```bash
./scripts/install-desktop.sh
```

The installer works entirely in your user account, with no `sudo`. The app continues running when the browser tab closes; use Workspace settings → Stop application to quit it.

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

Configuration, history, demo files, and backups are stored under:

```text
${XDG_DATA_HOME:-~/.local/share}/gda-sync/
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
npm run package      # Create dist/gda-sync using Node's single-executable format
```

For browser tests, install Chromium once:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Browser tests use an isolated temporary workspace and remove it after completion. They verify offline rendering, search/filtering, DDS previews, mobile layout, configuration, selected sync, full sync, persistence, and application shutdown. Screenshots are written to `build/preview-desktop.png` and `build/preview-mobile.png`.

Useful launch options:

```bash
./dist/gda-sync --no-open
GDA_SYNC_HOME=/path/to/app-data ./dist/gda-sync
PORT=4567 ./dist/gda-sync
GDA_SYNC_NO_OPEN=1 npm run dev
```

Launching a second instance reopens the running app on the same port. If another application occupies the port, GDA Sync exits with an explanation. `PORT` applies to production; the development proxy expects the backend on 3456.

## Structure

```text
backend/         Local API, filesystem sync, demo generator, DDS decoder
frontend/        React application, styles, and bundled icon
scripts/         Development, build, native packaging, desktop installation
config/          Example persisted workspace configuration
tests/          Core tests and browser workflow tests
build/           Generated frontend, bundled backend, screenshots
dist/           Generated standalone Linux executable
```

Packaging follows the [Node single-executable application workflow](https://nodejs.org/api/single-executable-applications.html). DDS decoding follows Microsoft's [DDS header](https://learn.microsoft.com/en-us/windows/win32/direct3ddds/dds-header) and [block-compression](https://learn.microsoft.com/en-us/windows/win32/direct3d10/d3d10-graphics-programming-guide-resources-block-compression) documentation.

The BC7 decoder and partition tables are adapted from [bcdec](https://github.com/iOrange/bcdec) under the MIT license. Its copyright and license are retained in `backend/bc7.ts` and the bundled application. Regression vectors cover all eight BC7 modes, all partition patterns, channel rotations, and index selectors.

Version 1.0.1 also retries failed thumbnails on Rescan, renews the local session after a server restart, and shows DDS images in full over a transparency grid with their original colors. HTML and frontend assets are served without caching to avoid retaining an older application build.
