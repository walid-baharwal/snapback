import { useMemo } from 'react'

interface Props {
  total: number
  page: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
  sizeOptions?: number[]
}

/**
 * Compact pagination control. Renders nothing when total fits on a single
 * page. Uses 1-indexed page numbers externally.
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  sizeOptions = [25, 50, 100, 200]
}: Props): JSX.Element | null {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const visible = useMemo(() => buildPageList(pages, page), [pages, page])
  if (total <= sizeOptions[0] && page === 1) return null

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-bg-card/60 px-3 py-2 text-xs text-text-muted">
      <span>
        {total === 0 ? '0' : `${start.toLocaleString()}–${end.toLocaleString()}`} of{' '}
        <span className="text-text">{total.toLocaleString()}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          className="rounded px-2 py-1 hover:bg-bg-subtle disabled:opacity-40"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          ‹ Prev
        </button>
        {visible.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-text-faint">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`rounded px-2 py-1 ${
                p === page
                  ? 'bg-accent text-bg font-semibold'
                  : 'text-text-muted hover:bg-bg-subtle hover:text-text'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          className="rounded px-2 py-1 hover:bg-bg-subtle disabled:opacity-40"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
        >
          Next ›
        </button>
      </div>
      {onPageSize && (
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="rounded border border-border bg-bg px-2 py-1 text-xs"
        >
          {sizeOptions.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

function buildPageList(pages: number, current: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(pages - 1, current + 1)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < pages - 1) out.push('…')
  out.push(pages)
  return out
}
