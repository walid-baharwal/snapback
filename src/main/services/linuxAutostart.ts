import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'

/**
 * Electron's `app.setLoginItemSettings()` is a no-op on Linux. To get the
 * daemon to relaunch after logout/reboot on GNOME, KDE, XFCE, Cinnamon and
 * every other XDG-compliant desktop environment we write a `.desktop` file
 * under `~/.config/autostart/`. The autostart spec is honoured by every
 * mainstream Linux DE (Xorg or Wayland), unlike the login-item API.
 *
 * Reference: https://specifications.freedesktop.org/autostart-spec/latest/
 */

const AUTOSTART_DIR = path.join(os.homedir(), '.config', 'autostart')
const AUTOSTART_FILE = path.join(AUTOSTART_DIR, 'snapback.desktop')

/**
 * Returns the absolute path to the binary the autostart entry should launch.
 * Prefers the AppImage filename (mount points change every run, but
 * `$APPIMAGE` is stable). Falls back to `process.execPath` when packaged via
 * deb/rpm/dir. Returns null in dev so we don't accidentally register the
 * developer's `node_modules/.bin/electron` as a login item.
 */
function resolveExecPath(): string | null {
  if (process.env.APPIMAGE) return process.env.APPIMAGE
  if (app.isPackaged) return process.execPath
  return null
}

function buildDesktopFileContents(execPath: string): string {
  // Spaces in paths must be quoted; Exec= follows shell-like word splitting.
  const quoted = execPath.includes(' ') ? `"${execPath}"` : execPath
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Snapback',
    'GenericName=File time machine',
    'Comment=Snapshots every save. Restore any version. Recover deleted files.',
    `Exec=${quoted} --hidden`,
    'Terminal=false',
    'Hidden=false',
    'NoDisplay=false',
    'X-GNOME-Autostart-enabled=true',
    'Categories=Utility;Development;',
    ''
  ].join('\n')
}

export function enableLinuxAutostart(): boolean {
  if (process.platform !== 'linux') return false
  const exec = resolveExecPath()
  if (!exec) return false
  try {
    fs.mkdirSync(AUTOSTART_DIR, { recursive: true })
    fs.writeFileSync(AUTOSTART_FILE, buildDesktopFileContents(exec), { mode: 0o644 })
    return true
  } catch (err) {
    console.error('[autostart] failed to write desktop entry', err)
    return false
  }
}

export function disableLinuxAutostart(): boolean {
  if (process.platform !== 'linux') return false
  try {
    if (fs.existsSync(AUTOSTART_FILE)) fs.unlinkSync(AUTOSTART_FILE)
    return true
  } catch (err) {
    console.error('[autostart] failed to remove desktop entry', err)
    return false
  }
}

export function isLinuxAutostartActive(): boolean {
  if (process.platform !== 'linux') return false
  return fs.existsSync(AUTOSTART_FILE)
}
