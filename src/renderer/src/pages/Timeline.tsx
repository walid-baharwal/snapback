import { useEffect, useMemo, useState } from 'react'
import type { SnapshotEvent, TimelineEntry } from '@shared/types'
import { basename, dirname, formatBytes, formatTime, isoDate } from '../lib/format'
import { Heatmap } from '../components/Heatmap'
import { Pagination } from '../components/Pagination'
import { useThrottledCallback } from '../lib/useThrottle'

interface Props {
  onSelectFile: (path: string) => void
}

export function Timeline({ onSelectFile }: Props): JSX.Element {
  const [date, setDate] = useState(isoDate())
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [counts, setCounts] = useState<{ date: string; count: number }[]>([])
  const [filter, setFilter] = useState('')
  const [eventFilter, setEventFilter] = useState<'all' | SnapshotEvent>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const refresh = async (forDate: string): Promise<void> => {
    const day = await window.api.timeline.day(forDate)
    setEntries(day.entries)
    const from = new Date()
    from.setDate(from.getDate() - 30)
    const days = await window.api.timeline.days(isoDate(from), isoDate())
    setCounts(days)
  }

  const throttledRefresh = useThrottledCallback(() => {
    void refresh(date)
  }, 5000)

  useEffect(() => {
    void refresh(date)
    setPage(1)
  }, [date])

  useEffect(() => {
    const off = window.api.events.onSnapshot(throttledRefresh)
    return off
  }, [throttledRefresh])

  const filtered = useMemo(() => {
    const lowered = filter.toLowerCase()
    return entries.filter(
      (e) =>
        (eventFilter === 'all' || e.event === eventFilter) &&
        (lowered === '' || e.filePath.toLowerCase().includes(lowered))
    )
  }, [entries, filter, eventFilter])

  useEffect(() => {
    setPage(1)
  }, [filter, eventFilter, pageSize])

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  )

  const grouped = useMemo(() => groupByHour(paged), [paged])
  const stats = useMemo(() => summarise(entries), [entries])

  return (
    <div className="grid h-full grid-rows-[auto_auto_1fr]">
      <section className="border-b border-border bg-bg-panel/40 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="label">Day</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input mt-1 w-44"
            />
          </div>
          <div className="grid flex-1 grid-cols-4 gap-3">
            <Stat label="Snapshots" value={stats.snapshots.toLocaleString()} />
            <Stat label="Files touched" value={stats.files.toLocaleString()} />
            <Stat label="Lines added" value={`+${stats.lines.toLocaleString()}`} />
            <Stat label="Bytes" value={formatBytes(stats.bytes)} />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-bg-panel/30 px-6 py-3">
        <Heatmap counts={counts} onSelect={(d) => setDate(d)} active={date} />
      </section>

      <section className="grid h-full grid-cols-[1fr] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden p-6">
          <div className="mb-3 flex items-center gap-2">
            <input
              placeholder="Filter by path..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input flex-1"
            />
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as 'all' | SnapshotEvent)}
              className="input w-40"
            >
              <option value="all">All events</option>
              <option value="create">Created</option>
              <option value="modify">Modified</option>
              <option value="delete">Deleted</option>
              <option value="rename">Renamed</option>
            </select>
          </div>
          <div className="card flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              {grouped.length === 0 ? (
                <div className="p-8 text-center text-sm text-text-muted">
                  {filtered.length === 0
                    ? 'No snapshots for this day yet. Edit a file in one of your watched folders to see it here.'
                    : 'No events on this page.'}
                </div>
              ) : (
                grouped.map(([hour, items]) => (
                  <div key={hour} className="border-b border-border last:border-b-0">
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg-card/95 px-4 py-2 text-xs uppercase tracking-wide text-text-faint backdrop-blur">
                      <span>{hour}</span>
                      <span className="text-text-muted">·</span>
                      <span>{items.length} events</span>
                    </div>
                    {items.map((e) => (
                      <button
                        key={e.snapshotId}
                        onClick={() => onSelectFile(e.filePath)}
                        className="grid w-full grid-cols-[80px_60px_1fr_auto] items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-bg-subtle"
                      >
                        <span className="font-mono text-xs text-text-muted">
                          {formatTime(e.ts)}
                        </span>
                        <EventBadge event={e.event} />
                        <span className="truncate">
                          <span className="text-text">{basename(e.filePath)}</span>
                          <span className="text-text-faint"> · {dirname(e.filePath)}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs text-text-muted">
                          <span className="chip">{formatBytes(e.size)}</span>
                          {e.lines > 0 && <span className="chip">{e.lines.toLocaleString()} lines</span>}
                          {e.encrypted && <span className="chip">encrypted</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
            <Pagination
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function EventBadge({ event }: { event: SnapshotEvent }): JSX.Element {
  const colors: Record<SnapshotEvent, string> = {
    create: 'bg-success/15 text-success border-success/30',
    modify: 'bg-accent/15 text-accent border-accent/30',
    delete: 'bg-danger/15 text-danger border-danger/30',
    rename: 'bg-warn/15 text-warn border-warn/30'
  }
  return (
    <span className={`inline-flex h-5 items-center justify-center rounded border px-2 text-[10px] uppercase tracking-wider ${colors[event]}`}>
      {event}
    </span>
  )
}

function groupByHour(entries: TimelineEntry[]): [string, TimelineEntry[]][] {
  const map = new Map<string, TimelineEntry[]>()
  for (const e of entries) {
    const d = new Date(e.ts)
    const key = `${d.getHours().toString().padStart(2, '0')}:00`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function summarise(entries: TimelineEntry[]): {
  snapshots: number
  files: number
  lines: number
  bytes: number
} {
  const files = new Set<string>()
  let lines = 0
  let bytes = 0
  for (const e of entries) {
    files.add(e.filePath)
    lines += e.lines
    bytes += e.size
  }
  return { snapshots: entries.length, files: files.size, lines, bytes }
}
