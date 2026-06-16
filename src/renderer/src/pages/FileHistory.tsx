import { useEffect, useMemo, useState } from 'react'
import type { FileRow, FileVersion, SnapshotEvent } from '@shared/types'
import { Diff } from '../components/Diff'
import { basename, dirname, formatBytes, formatRelative, formatTime } from '../lib/format'
import { Pagination } from '../components/Pagination'

interface Props {
  filePath: string | null
  onPickFile: (path: string) => void
}

export function FileHistory({ filePath, onPickFile }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<FileRow[]>([])
  const [versions, setVersions] = useState<FileVersion[]>([])
  const [selected, setSelected] = useState<FileVersion | null>(null)
  const [compareTo, setCompareTo] = useState<'current' | 'previous'>('previous')
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [restoredMsg, setRestoredMsg] = useState<string | null>(null)
  const [matchPage, setMatchPage] = useState(1)
  const matchPageSize = 25
  const [versionPage, setVersionPage] = useState(1)
  const versionPageSize = 25

  useEffect(() => {
    const id = setTimeout(async () => {
      if (!query) return setMatches([])
      const res = await window.api.files.search(query, true, 200)
      setMatches(res)
      setMatchPage(1)
    }, 200)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => {
    setSelected(null)
    setLeft('')
    setRight('')
    setVersions([])
    setVersionPage(1)
    if (!filePath) return
    void window.api.files.versions(filePath, 1000).then((v) => {
      setVersions(v)
      if (v.length > 0) setSelected(v[0])
    })
  }, [filePath])

  const pagedMatches = useMemo(
    () => matches.slice((matchPage - 1) * matchPageSize, matchPage * matchPageSize),
    [matches, matchPage]
  )
  const pagedVersions = useMemo(
    () => versions.slice((versionPage - 1) * versionPageSize, versionPage * versionPageSize),
    [versions, versionPage]
  )

  useEffect(() => {
    if (!selected || !filePath) return
    void loadDiff(selected, filePath, compareTo, versions, setLeft, setRight)
  }, [selected, compareTo, versions, filePath])

  const restore = async (): Promise<void> => {
    if (!selected) return
    setRestoring(true)
    try {
      const res = await window.api.files.restore(selected.snapshotId)
      setRestoredMsg(`Restored to ${res.restoredTo}`)
      setTimeout(() => setRestoredMsg(null), 4000)
      if (filePath) {
        const v = await window.api.files.versions(filePath)
        setVersions(v)
      }
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="grid h-full grid-cols-[320px_1fr] overflow-hidden">
      <aside className="border-r border-border bg-bg-panel/40 p-4">
        <div className="label">Find a file</div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by path..."
          className="input mt-2"
        />
        <div className="mt-3 max-h-[40%] overflow-hidden rounded-md border border-border bg-bg-card flex flex-col">
          <div className="flex-1 overflow-auto">
            {matches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-faint">
                {query ? 'No matches' : 'Type to search files in history'}
              </div>
            ) : (
              pagedMatches.map((m) => (
                <button
                  key={m.path}
                  onClick={() => onPickFile(m.path)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-bg-subtle ${
                    m.path === filePath ? 'bg-bg-subtle' : ''
                  }`}
                >
                  <span className="truncate text-sm text-text">{basename(m.path)}</span>
                  <span className="truncate text-[10px] text-text-faint">{dirname(m.path)}</span>
                  {m.status === 'deleted' && <span className="chip text-danger">deleted</span>}
                </button>
              ))
            )}
          </div>
          <Pagination
            total={matches.length}
            page={matchPage}
            pageSize={matchPageSize}
            onPage={setMatchPage}
          />
        </div>

        <div className="label mt-6">Versions</div>
        <div className="mt-2 flex flex-col overflow-hidden rounded-md border border-border bg-bg-card" style={{ maxHeight: 'calc(60vh - 200px)' }}>
          {filePath ? (
            <>
              <div className="flex-1 space-y-1 overflow-auto p-1">
                {pagedVersions.map((v) => (
                  <button
                    key={v.snapshotId}
                    onClick={() => setSelected(v)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
                      selected?.snapshotId === v.snapshotId
                        ? 'border-accent bg-accent/10'
                        : 'border-border bg-bg-card hover:bg-bg-subtle'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{formatTime(v.ts)}</span>
                      <span className="text-text-faint">{formatRelative(v.ts)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <EventTag event={v.event} />
                      <span className="text-[10px] text-text-faint">{formatBytes(v.size)}</span>
                    </div>
                  </button>
                ))}
              </div>
              <Pagination
                total={versions.length}
                page={versionPage}
                pageSize={versionPageSize}
                onPage={setVersionPage}
              />
            </>
          ) : (
            <div className="p-3 text-xs text-text-faint">
              Pick a file from the search or click one on the Timeline.
            </div>
          )}
        </div>
      </aside>

      <section className="flex h-full flex-col overflow-hidden p-4">
        {filePath ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{basename(filePath)}</div>
                <div className="truncate text-xs text-text-muted">{filePath}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={compareTo}
                  onChange={(e) => setCompareTo(e.target.value as 'current' | 'previous')}
                  className="input w-44"
                >
                  <option value="previous">Compare with previous</option>
                  <option value="current">Compare with current file</option>
                </select>
                <button onClick={restore} className="btn-primary" disabled={!selected || restoring}>
                  {restoring ? 'Restoring...' : 'Restore this version'}
                </button>
              </div>
            </div>
            {restoredMsg && (
              <div className="mb-3 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
                {restoredMsg}
              </div>
            )}
            <Diff left={left} right={right} leftLabel="Older" rightLabel="Newer" />
          </>
        ) : (
          <div className="grid h-full place-items-center text-text-muted">
            Search for a file to see its version history.
          </div>
        )}
      </section>
    </div>
  )
}

function EventTag({ event }: { event: SnapshotEvent }): JSX.Element {
  const cls =
    event === 'create'
      ? 'text-success'
      : event === 'delete'
        ? 'text-danger'
        : event === 'rename'
          ? 'text-warn'
          : 'text-accent'
  return <span className={`text-[10px] uppercase ${cls}`}>{event}</span>
}

async function loadDiff(
  selected: FileVersion,
  filePath: string,
  compareTo: 'current' | 'previous',
  versions: FileVersion[],
  setLeft: (s: string) => void,
  setRight: (s: string) => void
): Promise<void> {
  const newer = await window.api.files.readVersion(selected.snapshotId)
  if (compareTo === 'current') {
    const cur = await window.api.files.current(filePath)
    setLeft(newer.content)
    setRight(cur.exists ? cur.content : '(file no longer exists)')
    return
  }
  const idx = versions.findIndex((v) => v.snapshotId === selected.snapshotId)
  const olderVersion = idx >= 0 && idx < versions.length - 1 ? versions[idx + 1] : null
  if (!olderVersion) {
    setLeft('')
    setRight(newer.content)
    return
  }
  const older = await window.api.files.readVersion(olderVersion.snapshotId)
  setLeft(older.content)
  setRight(newer.content)
}
