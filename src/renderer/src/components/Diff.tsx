import { useMemo } from 'react'

interface Props {
  left: string
  right: string
  leftLabel?: string
  rightLabel?: string
}

type Op = { kind: 'eq' | 'del' | 'add'; text: string }

/** Simple line-based diff using the LCS algorithm. Good enough for previews. */
function diffLines(a: string, b: string): Op[] {
  const A = a.split(/\r?\n/)
  const B = b.split(/\r?\n/)
  const n = A.length
  const m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({ kind: 'eq', text: A[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', text: A[i] })
      i++
    } else {
      ops.push({ kind: 'add', text: B[j] })
      j++
    }
  }
  while (i < n) ops.push({ kind: 'del', text: A[i++] })
  while (j < m) ops.push({ kind: 'add', text: B[j++] })
  return ops
}

export function Diff({ left, right, leftLabel = 'Older', rightLabel = 'Newer' }: Props): JSX.Element {
  const ops = useMemo(() => diffLines(left, right), [left, right])
  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    for (const op of ops) {
      if (op.kind === 'add') added++
      if (op.kind === 'del') removed++
    }
    return { added, removed }
  }, [ops])

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-text-muted">
        <span>
          {leftLabel} <span className="text-text-faint">vs</span> {rightLabel}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-success">+{stats.added}</span>
          <span className="text-danger">-{stats.removed}</span>
        </span>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-5">
        {ops.length === 0 ? (
          <div className="p-6 text-center text-text-muted">No differences</div>
        ) : (
          ops.map((op, i) => <DiffLine key={i} op={op} />)
        )}
      </div>
    </div>
  )
}

function DiffLine({ op }: { op: Op }): JSX.Element {
  const cls =
    op.kind === 'add'
      ? 'bg-success/10 border-l-2 border-success text-success/90'
      : op.kind === 'del'
        ? 'bg-danger/10 border-l-2 border-danger text-danger/90'
        : 'border-l-2 border-transparent text-text-muted'
  const sigil = op.kind === 'add' ? '+' : op.kind === 'del' ? '-' : ' '
  return (
    <div className={`flex items-start px-3 py-[1px] ${cls}`}>
      <span className="mr-2 w-3 select-none">{sigil}</span>
      <pre className="flex-1 whitespace-pre-wrap break-all">{op.text || ' '}</pre>
    </div>
  )
}
