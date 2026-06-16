import { useEffect, useState } from 'react'
import type { StorageStats } from '@shared/types'
import { formatBytes } from '../lib/format'

export function Storage(): JSX.Element {
  const [stats, setStats] = useState<StorageStats[]>([])
  const [pruning, setPruning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = (): void => {
    void window.api.storage.stats().then(setStats)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [])

  const total = stats.reduce((s, x) => s + x.bytes, 0)

  const runPrune = async (): Promise<void> => {
    setPruning(true)
    try {
      const res = await window.api.storage.runPruneNow()
      setMsg(`Pruned ${res.deletedSnapshots} snapshots, freed ${formatBytes(res.freedBytes)}`)
      refresh()
    } finally {
      setPruning(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="stat">
          <div className="label">Total storage</div>
          <div className="mt-1 text-xl font-semibold">{formatBytes(total)}</div>
        </div>
        <div className="stat">
          <div className="label">Scopes</div>
          <div className="mt-1 text-xl font-semibold">{stats.length}</div>
        </div>
        <div className="stat flex items-center justify-between">
          <div>
            <div className="label">Retention</div>
            <div className="mt-1 text-xs text-text-muted">Runs hourly in the background</div>
          </div>
          <button onClick={runPrune} disabled={pruning} className="btn-secondary">
            {pruning ? 'Pruning...' : 'Run now'}
          </button>
        </div>
      </div>
      {msg && (
        <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          {msg}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_140px] border-b border-border bg-bg-card/60 px-4 py-2 text-[11px] uppercase tracking-wide text-text-faint">
          <span>Scope</span>
          <span className="text-right">Files</span>
          <span className="text-right">Snapshots</span>
          <span className="text-right">Bytes</span>
        </div>
        {stats.map((s, i) => (
          <div
            key={`${s.scopeId ?? 'unscoped'}-${i}`}
            className="grid grid-cols-[1fr_120px_120px_140px] items-center gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0"
          >
            <span className="truncate">{s.scopeName}</span>
            <span className="text-right text-text-muted">{s.fileCount.toLocaleString()}</span>
            <span className="text-right text-text-muted">{s.snapshotCount.toLocaleString()}</span>
            <span className="text-right font-medium">{formatBytes(s.bytes)}</span>
          </div>
        ))}
        {stats.length === 0 && (
          <div className="p-8 text-center text-sm text-text-muted">
            No snapshots stored yet. Edit a file in one of your watched folders.
          </div>
        )}
      </div>
    </div>
  )
}
