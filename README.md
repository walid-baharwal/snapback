# Snapback

A cross-platform file time machine. Snapback runs quietly in the system tray,
takes a deduplicated snapshot every time you save a file, lets you scrub a
visual daily timeline, and restores any earlier version with one click,
including files you have already deleted from disk.

Everything stays on your machine. Optional per-scope AES-256-GCM encryption of
stored blobs is available.

## Features

* True cross-platform desktop app: Windows, macOS and Linux from one Electron
  codebase.
* Snapshot-on-save backed by a content-addressed blob store with BLAKE3
  hashing, so identical content across files and versions costs zero extra
  bytes.
* Cascading rules engine. A global default, per-folder overrides and
  per-file-type or glob overrides on top.
* Time-based retention. A configurable keep-everything window, then automatic
  thinning into hourly, daily and weekly buckets, then hard delete after a
  max age. Per-scope size cap is also supported.
* Whole-machine mode that intelligently skips system directories and dotfiles
  on each OS (for example `~/Library` on macOS, `AppData` on Windows,
  `.cache`, `node_modules`, `.git` everywhere).
* Visual daily timeline plus a recovery view for files that no longer exist on
  disk.
* Autostart on login so the daemon comes back automatically after reboot.
  Uses XDG autostart on Linux, the Electron login items API on macOS and
  Windows.

## Download and install

End users do not need Node.js, Visual Studio, Xcode or any compilers. Just
grab the installer for your OS from the
[Releases page](https://github.com/walid-baharwal/snapback/releases/latest)
and double-click it like any other app.

### Windows

1. Download `Snapback-<version>-setup.exe` from the latest release.
2. Double-click it. Windows SmartScreen will show "Windows protected your
   PC" because the installer is not yet code-signed. Click **More info**,
   then **Run anyway**.
3. Follow the installer. By default Snapback installs per-user, creates a
   desktop shortcut, and adds itself to the Start menu.
4. Launch Snapback from the Start menu. The first run shows the setup
   wizard; after that it lives in the system tray near the clock.

To uninstall: Settings > Apps > Snapback > Uninstall.

### macOS

1. Download the matching dmg from the latest release:
   * `Snapback-<version>-arm64.dmg` for Apple Silicon Macs (M1/M2/M3/M4).
   * `Snapback-<version>-x64.dmg` for Intel Macs.
2. Open the dmg and drag **Snapback** into the **Applications** folder.
3. The first time you launch it, macOS Gatekeeper will say *"Snapback can't
   be opened because Apple cannot check it for malicious software"*. This
   is expected for unsigned apps. To bypass:
   * **Easy way:** Right-click (or Control-click) Snapback in Applications,
     choose **Open**, then click **Open** in the dialog. macOS remembers
     this choice; future launches just work.
   * **One-shot fix from Terminal:**
     ```bash
     xattr -dr com.apple.quarantine /Applications/Snapback.app
     ```
4. Snapback lives in the menu bar after launch.

To uninstall: drag Snapback from `/Applications` to the Trash.

### Linux

Two formats are published. Pick whichever fits your distro.

**AppImage (any distro, no install needed):**

```bash
chmod +x Snapback-<version>.AppImage
./Snapback-<version>.AppImage
```

**Debian / Ubuntu / Mint (.deb):**

```bash
sudo dpkg -i Snapback-<version>.deb
sudo apt-get install -f   # only if dpkg reports missing deps
```

The `.deb` installs into `/opt/Snapback/` and adds a desktop entry, so
Snapback appears in your application launcher.

If the watcher logs `ENOSPC: System limit for number of file watchers
reached`, bump the inotify limits once:

```bash
echo 'fs.inotify.max_user_watches=524288' | sudo tee -a /etc/sysctl.conf
echo 'fs.inotify.max_queued_events=131072' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### About the unsigned-app warnings

The installers are not yet signed with an Apple Developer ID or Windows
code-signing certificate, so both OSes will warn you on first launch. The
app itself is the same code you can read in this repo. Code signing is on
the roadmap; until then the workarounds above are the way in.

## Build from source (developers only)

You only need this if you want to compile your own installer, contribute
code, or run with hot reload. Regular users should use the prebuilt
installers above.

You need Node.js 18 or newer and a C/C++ toolchain so `better-sqlite3` can
build its native binding:

* Linux: `sudo apt install build-essential python3` (or your distro's
  equivalent).
* macOS: `xcode-select --install`.
* Windows: install the *Desktop development with C++* workload from
  [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/),
  plus Python 3. `npm` will pick them up automatically.

```bash
git clone https://github.com/walid-baharwal/snapback.git
cd snapback
npm install
npm run dev              # Electron with HMR on the renderer
npm run typecheck        # both tsconfig projects
npm run package          # build an installer for the current OS only
```

The packaged installer lands in `release/`. On Linux you can also run the
unpacked binary directly:

```bash
./release/linux-unpacked/snapback
```

If it aborts complaining about the SUID sandbox helper, either run it
with `--no-sandbox` or fix the helper permissions:

```bash
sudo chown root:root release/linux-unpacked/chrome-sandbox
sudo chmod 4755 release/linux-unpacked/chrome-sandbox
```

Per-OS packaging targets are also available, but each one only runs on
its own OS (native modules can't be cross-compiled):

```bash
npm run package:linux    # AppImage + deb
npm run package:win      # NSIS .exe
npm run package:mac      # dmg (x64 + arm64)
```

## Releasing

A push of a `v*` tag triggers
[`.github/workflows/release.yml`](.github/workflows/release.yml), which
builds Snapback on `ubuntu-latest`, `windows-latest` and `macos-latest`
in parallel and uploads every artifact (`.exe`, two `.dmg` files,
AppImage, `.deb`, plus the `latest*.yml` update metadata) to a GitHub
Release matching the tag.

To cut a release:

```bash
# Bump the version in package.json first, commit it, then:
git tag v0.1.0
git push origin v0.1.0
```

Watch the run under the
[Actions tab](https://github.com/walid-baharwal/snapback/actions). When
all three jobs are green, the release with the installers is live at
`https://github.com/walid-baharwal/snapback/releases/tag/v0.1.0`.

## Project structure

```
src/
  main/                  Electron main process (background daemon).
    index.ts             App entry point, window + tray lifecycle.
    tray.ts              System tray menu (pause/resume, quit).
    db/
      database.ts        SQLite (better-sqlite3) connection.
      schema.ts          Table definitions and migrations.
    storage/
      blobStore.ts       Content-addressed blob store (BLAKE3 hashing).
      storageEngine.ts   Snapshot capture, dedupe, content reads.
      textStats.ts       Line/word/char counts, binary detection.
    services/
      watcher.ts         chokidar based file watcher.
      rulesEngine.ts     Cascading rule resolution (global -> folder -> type).
      retention.ts       Hourly thinning, hard delete, size cap, blob GC.
      scopesRepo.ts      Scope CRUD against SQLite.
      preferences.ts     JSON-backed user preferences.
      encryption.ts      Optional AES-256-GCM blob encryption.
      dryRun.ts          Estimate matched files + storage cost for a scope.
      linuxAutostart.ts  Writes ~/.config/autostart/snapback.desktop.
    ipc/
      handlers.ts        Every IPC channel implementation.

  preload/
    index.ts             contextBridge exposing window.api to the renderer.

  renderer/
    src/
      App.tsx            Top-level page router.
      components/
        Shell.tsx        Sidebar + topbar layout.
        Diff.tsx         Simple line-level diff viewer.
        Heatmap.tsx      GitHub-style daily activity heatmap.
        Pagination.tsx   Reusable client-side pagination.
      pages/
        Setup.tsx        First-run wizard (folders vs whole machine).
        Timeline.tsx     Daily timeline of file changes.
        FileHistory.tsx  Versions of a single file.
        Recovery.tsx     Search and restore deleted files.
        RulesManager.tsx Scopes + rule editor (drag-resizable panel).
        Storage.tsx      Disk usage per scope, "Run retention now".
        Settings.tsx     App preferences.
      lib/
        format.ts, useThrottle.ts

  shared/
    types.ts             Cross-process types (IPC payloads, scope shape).
    ipcChannels.ts       Channel name constants used by both sides.
    defaults.ts          Default global rules, common excludes, OS excludes.

electron.vite.config.ts  Vite config for main, preload and renderer.
electron-builder.yml     Installer config (NSIS, dmg, AppImage, deb).
build/after-install.sh   Linux post-install hook.
tsconfig.{node,web}.json Separate TS projects for backend vs renderer.
```

The main process talks to the renderer only through the channels declared in
`src/shared/ipcChannels.ts`. The shape of every payload lives in
`src/shared/types.ts`, so the renderer never imports anything from `main/`
directly. This separation is what keeps the security boundary clean
(`sandbox: false`, `contextIsolation: true`, `nodeIntegration: false`).

## Contributing

1. Fork the repo and create a feature branch.
2. Run `npm install`, then `npm run dev` to develop with hot reload on the
   renderer.
3. Before committing run `npm run typecheck`. Both projects must pass.
4. Keep the IPC surface small. New features should add a channel to
   `shared/ipcChannels.ts`, types to `shared/types.ts`, a handler in
   `main/ipc/handlers.ts` and an entry in `preload/index.ts`.
5. New main-process work that can block (file IO, hashing, walks) belongs in
   a service under `src/main/services/`. Keep `main/index.ts` skinny.
6. UI changes should respect the Tailwind tokens already defined in
   `tailwind.config.cjs` (background, border, text, accent, success, warn,
   danger). Avoid hard-coded colors.
7. Open a pull request describing what changed and how to reproduce. Include
   screenshots for renderer changes.

### Coding standards

* TypeScript strict everywhere. No `any` without a comment explaining why.
* Prefer pure functions in services. Side effects belong at the edges
  (handlers, watcher, scheduler).
* Comments should explain non-obvious intent or constraints, not narrate the
  code.

## Where data lives

* `<userData>/snapback/snapback.db` is the SQLite index.
* `<userData>/snapback/blobs/<aa>/<hash>` stores content-addressed blobs.
* `<userData>/snapback/enc.key` is the generated AES-256 key (mode 0600).
* `<userData>/snapback/preferences.json` is the user preferences file.

`<userData>` resolves to `~/.config/snapback/` on Linux,
`~/Library/Application Support/Snapback/` on macOS, and
`%APPDATA%\Snapback\` on Windows.

To reset Snapback completely, quit it (tray menu) and delete the
`<userData>/snapback` directory.

## Defaults that protect you

* `.env`, `*.pem`, SSH keys and other secret patterns are excluded by default.
* Binary files are skipped (size only on the `everything` preset).
* Per-folder `.gitignore` is respected on the Code preset.
* A max file size cap (5 MB global, 10 MB per scope by default) prevents huge
  files from overwhelming the index.
* The actual files on your disk are never written to. Retention only prunes
  Snapback's snapshot copies, never your live files.

## License

MIT. See `LICENSE` (or `package.json`) for details.
