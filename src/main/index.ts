import { app, BrowserWindow, shell, type Tray } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { initDatabase } from './db/database'
import { initEncryption } from './services/encryption'
import { StorageEngine } from './storage/storageEngine'
import { ScopesRepo } from './services/scopesRepo'
import { RulesEngine } from './services/rulesEngine'
import { WatcherService } from './services/watcher'
import { RetentionScheduler } from './services/retention'
import { PreferencesStore } from './services/preferences'
import { defaultGlobalRules } from '@shared/defaults'
import { Channels } from '@shared/ipcChannels'
import { registerIpc, syncAutostart, type DaemonContext } from './ipc/handlers'
import { createTray } from './tray'
import type { DaemonStatus } from '@shared/types'

/**
 * `--hidden` is passed by our XDG autostart `.desktop` file on Linux. When
 * present we boot the daemon straight to the tray instead of popping the
 * dashboard window — the whole point of autostart is invisible background
 * tracking. On macOS the OS handles `openAsHidden` natively.
 */
const launchedHidden = process.argv.includes('--hidden')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let daemonContext: DaemonContext | null = null

function resolveStorageDir(): string {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'snapback')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function broadcastStatus(status: DaemonStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(Channels.daemon.statusChanged, status)
  }
}

function bootDaemon(): DaemonContext {
  const storageDir = resolveStorageDir()
  const db = initDatabase(storageDir)
  initEncryption(storageDir)
  const blobsDir = path.join(storageDir, 'blobs')

  const storage = new StorageEngine(db, blobsDir)
  const scopesRepo = new ScopesRepo(db)
  scopesRepo.ensureGlobal(defaultGlobalRules())
  const rules = new RulesEngine()
  rules.setScopes(scopesRepo.list())
  const watcher = new WatcherService(rules, storage)
  const retention = new RetentionScheduler(db, storage, scopesRepo)

  const prefs = new PreferencesStore(storageDir)
  let status: DaemonStatus = { state: 'warming', pausedReason: null }

  const ctx: DaemonContext = {
    prefs,
    scopesRepo,
    rules,
    storage,
    watcher,
    retention,
    startedAt: Date.now(),
    status,
    emitStatus(next) {
      status = next
      this.status = next
      broadcastStatus(next)
    }
  }
  daemonContext = ctx
  registerIpc(ctx)
  retention.start()
  return ctx
}

/**
 * Attach file watchers AFTER the window is presented. Chokidar's initial
 * registration walks the entire watched tree synchronously enough to block the
 * UI; running it after the window paints avoids the perceived "stuck for
 * minutes on launch" lag.
 */
function startWatcherDeferred(ctx: DaemonContext): void {
  const scopes = ctx.scopesRepo.list()
  if (scopes.filter((s) => s.enabled && s.type === 'folder').length === 0) {
    ctx.emitStatus({ state: 'running', pausedReason: null })
    return
  }
  ctx.emitStatus({ state: 'warming', pausedReason: null })
  // 3s gives the renderer time to fully load and paint before chokidar
  // begins walking; users see the UI immediately rather than a frozen window.
  setTimeout(() => {
    void ctx.watcher
      .syncScopes(scopes)
      .then(() => ctx.emitStatus({ state: 'running', pausedReason: null }))
      .catch((err) => {
        console.error('[boot] watcher sync failed', err)
        ctx.emitStatus({ state: 'running', pausedReason: null })
      })
  }, 3000)
}

function createMainWindow(ctx: DaemonContext): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
    title: 'Snapback',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    if (launchedHidden && ctx.prefs.get().setupComplete) return
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

let isQuitting = false

app.on('before-quit', () => {
  isQuitting = true
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    const ctx = bootDaemon()
    syncAutostart(!!ctx.prefs.get().autostart)
    mainWindow = createMainWindow(ctx)
    tray = createTray(ctx, () => mainWindow)
    void tray
    startWatcherDeferred(ctx)
  })

  app.on('window-all-closed', () => {
    // Keep the daemon running in the tray on every platform.
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
    } else if (daemonContext) {
      mainWindow = createMainWindow(daemonContext)
    }
  })

  app.on('will-quit', async () => {
    if (daemonContext) {
      daemonContext.retention.stop()
      await daemonContext.watcher.stopAll()
    }
  })
}
