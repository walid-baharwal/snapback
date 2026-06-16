import { useEffect, useState } from 'react'
import type { AppPreferences } from '@shared/types'

export function Settings(): JSX.Element {
  const [prefs, setPrefs] = useState<AppPreferences | null>(null)

  useEffect(() => {
    void window.api.setup.getPreferences().then(setPrefs)
  }, [])

  if (!prefs) return <div className="p-6 text-text-muted">Loading...</div>

  return (
    <div className="space-y-6 p-6">
      <div className="card max-w-2xl p-4">
        <div className="label">Storage location</div>
        <div className="mt-1 break-all text-sm">{prefs.storageLocation}</div>
        <div className="mt-1 text-xs text-text-faint">
          Your snapshots and the SQLite index live here. Encryption key is stored in this folder.
        </div>
      </div>

      <div className="card max-w-2xl space-y-3 p-4">
        <ToggleRow
          label="Start on login"
          badge="Recommended"
          description="Required for snapshots to keep happening after a reboot. Snapback launches hidden in the system tray when you sign in — close the window any time, tracking continues in the background."
          value={prefs.autostart}
          onChange={async (v) => {
            const next = await window.api.setup.updatePreferences({ autostart: v })
            setPrefs(next)
          }}
        />
        <ToggleRow
          label="Pause on battery"
          description="Stop taking snapshots while running on battery to conserve power."
          value={prefs.pauseOnBattery}
          onChange={async (v) => {
            const next = await window.api.setup.updatePreferences({ pauseOnBattery: v })
            setPrefs(next)
          }}
        />
      </div>

      <div className="card max-w-2xl p-4">
        <div className="label">About</div>
        <div className="mt-1 text-sm">Snapback - file time machine</div>
        <div className="mt-1 text-xs text-text-faint">
          Snapshots every save, restore any version, recover deleted files. All local.
        </div>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  badge
}: {
  label: string
  description: string
  value: boolean
  onChange: (v: boolean) => void
  badge?: string
}): JSX.Element {
  return (
    <label className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-sm">
          {label}
          {badge ? (
            <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              {badge}
            </span>
          ) : null}
        </div>
        <div className="text-xs text-text-faint">{description}</div>
      </div>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
    </label>
  )
}
