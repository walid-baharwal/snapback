import { useMemo } from 'react'
import { isoDate } from '../lib/format'

interface Props {
  counts: { date: string; count: number }[]
  onSelect: (date: string) => void
  active: string
  days?: number
}

/** GitHub-style contribution heatmap for the last N days. */
export function Heatmap({ counts, onSelect, active, days = 90 }: Props): JSX.Element {
  const cells = useMemo(() => {
    const map = new Map(counts.map((c) => [c.date, c.count]))
    const arr: { date: string; count: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = isoDate(d)
      arr.push({ date: key, count: map.get(key) ?? 0 })
    }
    return arr
  }, [counts, days])

  const max = Math.max(1, ...cells.map((c) => c.count))
  const intensity = (c: number): string => {
    if (c === 0) return 'bg-bg-subtle'
    const t = c / max
    if (t < 0.2) return 'bg-accent/20'
    if (t < 0.5) return 'bg-accent/40'
    if (t < 0.8) return 'bg-accent/70'
    return 'bg-accent'
  }

  const weeks = useMemo(() => {
    const out: { date: string; count: number }[][] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [cells])

  return (
    <div className="flex items-center gap-3 overflow-x-auto">
      <div className="label">Last {days} days</div>
      <div className="flex gap-[3px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {w.map((d) => (
              <button
                key={d.date}
                onClick={() => onSelect(d.date)}
                title={`${d.date} · ${d.count} events`}
                className={`h-3 w-3 rounded-sm ${intensity(d.count)} ${
                  d.date === active ? 'ring-2 ring-accent' : ''
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
