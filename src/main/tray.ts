import { app, Menu, nativeImage, Tray } from 'electron'
import path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import type { DaemonContext } from './ipc/handlers'
import type { BrowserWindow } from 'electron'

const TRAY_ICON_PNG = path.join(__dirname, '../../resources/tray.png')

function loadIcon(): Electron.NativeImage {
  if (existsSync(TRAY_ICON_PNG)) {
    return nativeImage.createFromPath(TRAY_ICON_PNG).resize({ width: 16, height: 16 })
  }
  const png1x1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63600000000005000147bd2dca0000000049454e44ae426082',
    'hex'
  )
  return nativeImage.createFromBuffer(png1x1).resize({ width: 16, height: 16 })
}

export function createTray(ctx: DaemonContext, getMainWindow: () => BrowserWindow | null): Tray {
  const tray = new Tray(loadIcon())
  tray.setToolTip('Snapback')

  const refreshMenu = (): void => {
    const status = ctx.status
    const isRunning = status.state === 'running'
    const isWarming = status.state === 'warming'
    const menu = Menu.buildFromTemplate([
      {
        label: isWarming
          ? 'Snapback - warming up...'
          : isRunning
            ? 'Snapback - running'
            : `Snapback - ${status.state}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: isRunning ? 'Pause snapshots' : 'Resume snapshots',
        enabled: !isWarming,
        click: () => {
          if (isRunning) {
            ctx.watcher.setPaused(true)
            ctx.emitStatus({ state: 'paused', pausedReason: 'user' })
          } else {
            ctx.watcher.setPaused(false)
            ctx.emitStatus({ state: 'running', pausedReason: null })
          }
          refreshMenu()
        }
      },
      {
        label: 'Open dashboard',
        click: () => {
          const win = getMainWindow()
          if (win) {
            if (win.isMinimized()) win.restore()
            win.show()
            win.focus()
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Snapback',
        click: () => {
          app.exit(0)
        }
      }
    ])
    tray.setContextMenu(menu)
  }

  refreshMenu()
  tray.on('click', () => {
    const win = getMainWindow()
    if (win) {
      win.isVisible() ? win.hide() : win.show()
    }
  })

  return tray
}
