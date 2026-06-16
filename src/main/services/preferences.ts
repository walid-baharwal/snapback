import fs from 'node:fs'
import path from 'node:path'
import type { AppPreferences } from '@shared/types'

/**
 * Lightweight JSON-backed preferences store. We avoid electron-store as a hard
 * dependency for simpler bundling and instant initialisation.
 */
export class PreferencesStore {
  private file: string
  private data: AppPreferences

  constructor(storageDir: string) {
    this.file = path.join(storageDir, 'preferences.json')
    this.data = this.load()
  }

  private load(): AppPreferences {
    const defaults: AppPreferences = {
      setupComplete: false,
      pauseOnBattery: false,
      autostart: true,
      storageLocation: path.dirname(this.file),
      defaultMode: null
    }
    if (!fs.existsSync(this.file)) return defaults
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<AppPreferences>
      return { ...defaults, ...parsed }
    } catch {
      return defaults
    }
  }

  get(): AppPreferences {
    return this.data
  }

  update(patch: Partial<AppPreferences>): AppPreferences {
    this.data = { ...this.data, ...patch }
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2))
    return this.data
  }
}
