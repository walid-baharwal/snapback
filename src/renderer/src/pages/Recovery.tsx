import { useEffect, useMemo, useState } from 'react'
import type { FileRow, FileVersion } from '@shared/types'
import { basename, dirname, formatBytes, formatRelative } from '../lib/format'
import { Pagination } from '../components/Pagination'

interface Props {
  onPickFile: (path: string) => void
}

export function Recovery({ onPickFile }: Props): JSX.Element {
  const [deleted, setDeleted] = useState<FileRow[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileRow[]>([])
  const [selected, setSelected] = useState<FileRow | null>(null)
  const [versions, setVersions] = useState<FileVersion[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    void window.api.files.deleted(500).then(setDeleted)
  }, [msg])

  useEffect(() => {
    const id = setTimeout(async () => {
      if (!query) return setResults([])
      const r = await window.api.files.search(query, true, 200)
      setResults(r)
    }, 200)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => {
    setPage(1)
  }, [query, pageSize])

  const source = query ? results : deleted
  const paged = useMemo(
    () => source.slice((page - 1) * pageSize, page * pageSize),
    [source, page, pageSize]
  )

  useEffect(() => {
    if (!selected) return setVersions([])
    void window.api.files.versions(selected.path, 50).then(setVersions)
  }, [selected])

  const restoreLatest = async (path: string): Promise<void> => {
    setBusy(true)
    try {
      const v = await window.api.files.versions(path, 100)
      const recoverable = v.find((s) => s.event !== 'delete')
      if (!recoverable) {
        setMsg('No recoverable version found')
        return
      }
      const res = await window.api.files.restore(recoverable.snapshotId)
      setMsg(`Restored ${path} -> ${res.restoredTo}`)
    } catch (err) {
      setMsg(String(err))
    } finally {
      setBusy(false)
      setTimeout(() => setMsg(null), 5000)
    }
  }

  return (
    <div className="grid h-full grid-cols-[1fr_400px] overflow-hidden">
      <div className="flex h-full flex-col p-6">
        <div className="mb-3 flex items-center gap-3">
          <input
            placeholder="Search any file in history (deleted or current)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input flex-1"
          />
        </div>
        {msg && (
          <div className="mb-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
            {msg}
          </div>
        )}
        <div className="card flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-border bg-bg-card/60 px-4 py-2 text-xs uppercase tracking-wide text-text-faint">
            {query ? 'Search results' : 'Recently deleted'}
          </div>
          <div className="flex-1 overflow-auto">
            {source.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                {query ? 'Nothing matched.' : 'No deleted files in history yet.'}
              </div>
            ) : (
              paged.map((f) => (
                <div
                  key={f.path}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 ${
                    selected?.path === f.path ? 'bg-bg-subtle' : ''
                  }`}
                >
                  <button
                    onClick={() => setSelected(f)}
                    className="flex min-w-0 flex-col text-left text-sm"
                  >
                    <span className="truncate">{basename(f.path)}</span>
                    <span className="truncate text-xs text-text-faint">{dirname(f.path)}</span>
                  </button>
                  <span className={`chip ${f.status === 'deleted' ? 'text-danger' : 'text-accent'}`}>
                    {f.status} · {formatRelative(f.lastSeenTs)}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => onPickFile(f.path)} className="btn-ghost">
                      History
                    </button>
                    <button
                      onClick={() => restoreLatest(f.path)}
                      disabled={busy}
                      className="btn-primary"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <Pagination
            total={source.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </div>
      </div>

      <aside className="border-l border-border bg-bg-panel/40 p-4">
        <div className="label">Versions</div>
        {selected ? (
          <>
            <div className="mt-2 truncate text-sm">{selected.path}</div>
            <div className="mt-3 space-y-1">
              {versions.map((v) => (
                <div
                  key={v.snapshotId}
                  className="card flex items-center justify-between px-3 py-2 text-xs"
                >
                  <div className="flex flex-col">
                    <span>{new Date(v.ts).toLocaleString()}</span>
                    <span className="text-text-faint">
                      {v.event} · {formatBytes(v.size)}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      setBusy(true)
                      try {
                        const r = await window.api.files.restore(v.snapshotId)
                        setMsg(`Restored to ${r.restoredTo}`)
                      } finally {
                        setBusy(false)
                        setTimeout(() => setMsg(null), 5000)
                      }
                    }}
                    className="btn-secondary"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-text-muted">Pick a file to inspect its versions.</p>
        )}
      </aside>
    </div>
  )
}
