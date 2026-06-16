import { useEffect, useState } from 'react'
import type { DaemonInfo, DaemonStatus } from '@shared/types'
import type { PageKey } from '../App'
import { formatBytes } from '../lib/format'
import { useThrottledCallback } from '../lib/useThrottle'

interface NavItem {
  key: PageKey
  label: string
  icon: string
  description: string
}

const NAV: NavItem[] = [
  { key: 'timeline', label: 'Timeline', icon: '/', description: 'A day in the life of your files' },
  { key: 'history', label: 'File history', icon: '⌘', description: 'Versions of a single file' },
  { key: 'recovery', label: 'Recovery', icon: '↺', description: 'Bring deleted files back' },
  { key: 'rules', label: 'Rules', icon: '◇', description: 'Scopes, filters & retention' },
  { key: 'storage', label: 'Storage', icon: '◧', description: 'Disk usage by scope' },
  { key: 'settings', label: 'Settings', icon: '⚙', description: 'App preferences' }
]

interface Props {
  page: PageKey
  status: DaemonStatus
  onNavigate: (page: PageKey) => void
  children: React.ReactNode
}

export function Shell({ page, status, onNavigate, children }: Props): JSX.Element {
  const [info, setInfo] = useState<DaemonInfo | null>(null)

  const refreshInfo = useThrottledCallback(() => {
    void window.api.daemon.getInfo().then(setInfo)
  }, 5000)

  useEffect(() => {
    refreshInfo()
    const id = setInterval(refreshInfo, 15000)
    const off = window.api.events.onSnapshot(refreshInfo)
    return () => {
      clearInterval(id)
      off()
    }
  }, [refreshInfo])

  const togglePause = async (): Promise<void> => {
    if (status.state === 'running') {
      await window.api.daemon.pause('user')
    } else {
      await window.api.daemon.resume()
    }
  }

  const active = NAV.find((n) => n.key === page)

  return (
    <div className="grid h-full grid-cols-[240px_1fr]">
      <aside className="border-r border-border bg-bg-panel/60 px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-card text-text font-semibold">
            S
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Snapback</span>
            <span className="text-[10px] text-text-faint">File time machine</span>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                page === item.key
                  ? 'bg-bg-card text-text border border-border'
                  : 'border border-transparent text-text-muted hover:bg-bg-subtle hover:text-text'
              }`}
            >
              <span className="font-mono text-xs text-accent">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-8 panel space-y-3 p-3">
          <div className="flex items-center justify-between">
            <span className="label">Daemon</span>
            <StatusDot status={status} />
          </div>
          <div className="space-y-1 text-xs text-text-muted">
            <div className="flex justify-between">
              <span>Watched</span>
              <span className="text-text">{info?.watchedScopes ?? 0} scopes</span>
            </div>
            <div className="flex justify-between">
              <span>Snapshots</span>
              <span className="text-text">{info?.snapshotCount.toLocaleString() ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Storage</span>
              <span className="text-text">{formatBytes(info?.totalBytes ?? 0)}</span>
            </div>
          </div>
          <button
            onClick={togglePause}
            className="btn-secondary w-full"
            disabled={status.state === 'warming'}
          >
            {status.state === 'warming'
              ? 'Warming up...'
              : status.state === 'running'
                ? 'Pause snapshots'
                : 'Resume snapshots'}
          </button>
        </div>
      </aside>
      <main className="flex h-full flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-bg-panel/40 px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold">{active?.label}</h1>
            <p className="text-xs text-text-muted">{active?.description}</p>
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-bg">{children}</div>
      </main>
    </div>
  )
}

function StatusDot({ status }: { status: DaemonStatus }): JSX.Element {
  const color =
    status.state === 'running'
      ? 'bg-success'
      : status.state === 'warming'
        ? 'bg-warn animate-pulse'
        : status.state === 'paused'
          ? 'bg-warn'
          : 'bg-danger'
  const label =
    status.state === 'running'
      ? 'Running'
      : status.state === 'warming'
        ? 'Warming up...'
        : status.state === 'paused'
          ? `Paused (${status.pausedReason})`
          : 'Stopped'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`h-2 w-2 rounded-full ${color}`}></span> {label}
    </span>
  )
}
