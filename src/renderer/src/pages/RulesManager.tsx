import { useCallback, useEffect, useRef, useState } from 'react'
import type { DryRunEstimate, Scope, ScopePreset, ScopeRules } from '@shared/types'
import { formatBytes } from '../lib/format'

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 720
const DEFAULT_PANEL_WIDTH = 440
const PANEL_WIDTH_KEY = 'snapback:rules.panelWidth'
// Below this container width we collapse to a single-column layout and show
// the editor as a slide-over drawer instead of a fixed side panel. Below
// this, fitting both the scopes table and a 320px editor side-by-side leaves
// no usable room for either.
const STACK_BREAKPOINT = 820

export function RulesManager(): JSX.Element {
  const [scopes, setScopes] = useState<Scope[]>([])
  const [selected, setSelected] = useState<Scope | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY))
    return Number.isFinite(stored) && stored >= MIN_PANEL_WIDTH && stored <= MAX_PANEL_WIDTH
      ? stored
      : DEFAULT_PANEL_WIDTH
  })

  const reload = async (): Promise<void> => {
    const s = await window.api.scopes.list()
    setScopes(s)
    if (selected) {
      const updated = s.find((x) => x.id === selected.id) ?? null
      setSelected(updated)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const updateRules = async (rules: ScopeRules): Promise<void> => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await window.api.scopes.update(selected.id, rules)
      setSelected(updated)
      void reload()
    } finally {
      setSaving(false)
    }
  }

  const removeScope = async (): Promise<void> => {
    if (!selected) return
    if (!confirm(`Remove scope "${selected.name}"? Stored snapshots will remain.`)) return
    await window.api.scopes.remove(selected.id)
    setSelected(null)
    void reload()
  }

  const containerRef = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setContainerWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isNarrow = containerWidth > 0 && containerWidth < STACK_BREAKPOINT
  // Clamp panel to current container so it never overflows when the window
  // shrinks to just above the stacking breakpoint.
  const maxAllowed = Math.max(MIN_PANEL_WIDTH, containerWidth - 360)
  const effectivePanelWidth = Math.min(panelWidth, maxAllowed)

  const startResize = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    draggingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const next = Math.min(
        MAX_PANEL_WIDTH,
        Math.max(MIN_PANEL_WIDTH, rect.right - e.clientX)
      )
      setPanelWidth(next)
    }
    const onUp = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [panelWidth])

  const scopesList = (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="label">Scopes</div>
        <button onClick={() => setShowAdd(true)} className="btn-primary shrink-0">
          + Add folder scope
        </button>
      </div>
      <div className="card flex-1 min-h-0 overflow-auto">
        <div className="grid grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px_80px] border-b border-border bg-bg-card/60 px-4 py-2 text-[11px] uppercase tracking-wide text-text-faint">
          <span>Scope</span>
          <span className="hidden sm:inline">Type</span>
          <span>Captures</span>
          <span className="text-right">State</span>
        </div>
        {scopes.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className={`grid w-full grid-cols-[1fr_80px_80px] sm:grid-cols-[1fr_120px_120px_80px] items-center gap-2 border-b border-border px-4 py-3 text-left text-sm last:border-b-0 hover:bg-bg-subtle ${
              selected?.id === s.id ? 'bg-bg-subtle' : ''
            }`}
          >
            <div className="min-w-0">
              <div className="truncate font-medium">{s.name || s.pathOrPattern}</div>
              <div className="truncate text-xs text-text-faint">{s.pathOrPattern}</div>
              {s.parentId && (
                <div className="mt-1 text-[10px] text-text-faint">
                  Inherits from #{s.parentId}
                </div>
              )}
            </div>
            <span className="chip hidden sm:inline-flex">{s.type}</span>
            <span className="chip">{s.rules.filters.captureMode}</span>
            <span
              className={`text-right text-xs ${s.enabled ? 'text-success' : 'text-text-faint'}`}
            >
              {s.enabled ? 'on' : 'off'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      {isNarrow ? (
        // Narrow: single-column layout with editor as a slide-over drawer.
        <div className="h-full">{scopesList}</div>
      ) : (
        <div
          className="grid h-full"
          style={{ gridTemplateColumns: `1fr 8px ${effectivePanelWidth}px` }}
        >
          {scopesList}
          <ResizeHandle onMouseDown={startResize} />
          <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-border bg-bg-panel/40">
            {selected ? (
              <ScopeEditor
                scope={selected}
                saving={saving}
                onSave={updateRules}
                onRemove={removeScope}
                onClose={null}
              />
            ) : (
              <div className="p-4 text-sm text-text-muted">
                Select a scope to edit its rules.
              </div>
            )}
          </aside>
        </div>
      )}

      {showAdd && (
        <AddScopeModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            void reload()
          }}
        />
      )}

      {/* Narrow-mode drawer */}
      {isNarrow && selected && (
        <div className="absolute inset-0 z-40 flex">
          <div
            onClick={() => setSelected(null)}
            className="flex-1 bg-black/60 backdrop-blur-sm"
          />
          <aside className="flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-bg-panel shadow-2xl">
            <ScopeEditor
              scope={selected}
              saving={saving}
              onSave={updateRules}
              onRemove={removeScope}
              onClose={() => setSelected(null)}
            />
          </aside>
        </div>
      )}
    </div>
  )
}

function ResizeHandle({
  onMouseDown
}: {
  onMouseDown: (e: React.MouseEvent) => void
}): JSX.Element {
  return (
    <div
      onMouseDown={onMouseDown}
      title="Drag to resize panel"
      role="separator"
      aria-orientation="vertical"
      className="group relative h-full cursor-col-resize select-none bg-border/40 hover:bg-accent/60 transition-colors"
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center">
        <div className="flex flex-col gap-0.5">
          <div className="h-1 w-1 rounded-full bg-text-faint group-hover:bg-bg"></div>
          <div className="h-1 w-1 rounded-full bg-text-faint group-hover:bg-bg"></div>
          <div className="h-1 w-1 rounded-full bg-text-faint group-hover:bg-bg"></div>
        </div>
      </div>
    </div>
  )
}

function ScopeEditor({
  scope,
  saving,
  onSave,
  onRemove,
  onClose
}: {
  scope: Scope
  saving: boolean
  onSave: (r: ScopeRules) => void
  onRemove: () => void
  onClose: (() => void) | null
}): JSX.Element {
  const [draft, setDraft] = useState<ScopeRules>(scope.rules)

  useEffect(() => setDraft(scope.rules), [scope.id, scope.rules])

  const set = (patch: Partial<ScopeRules>): void =>
    setDraft((d) => ({
      filters: { ...d.filters, ...(patch.filters ?? {}) },
      triggers: { ...d.triggers, ...(patch.triggers ?? {}) },
      retention: { ...d.retention, ...(patch.retention ?? {}) },
      security: { ...d.security, ...(patch.security ?? {}) }
    }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{scope.name || scope.pathOrPattern}</div>
          <div className="truncate text-xs text-text-faint" title={scope.pathOrPattern}>
            {scope.pathOrPattern}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="btn-ghost shrink-0 text-base leading-none"
            title="Close"
            aria-label="Close panel"
          >
            ×
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <Section title="Filters">
        <Row label="Capture mode">
          <select
            value={draft.filters.captureMode}
            onChange={(e) => set({ filters: { ...draft.filters, captureMode: e.target.value as ScopeRules['filters']['captureMode'] } })}
            className="input"
          >
            <option value="code">Coding files</option>
            <option value="docs">Documents</option>
            <option value="everything">Everything</option>
          </select>
        </Row>
        <Row label="Include globs (one per line)">
          <textarea
            value={draft.filters.includeGlobs.join('\n')}
            onChange={(e) =>
              set({ filters: { ...draft.filters, includeGlobs: e.target.value.split('\n').filter(Boolean) } })
            }
            className="input h-24"
          />
        </Row>
        <Row label="Exclude globs (one per line)">
          <textarea
            value={draft.filters.excludeGlobs.join('\n')}
            onChange={(e) =>
              set({ filters: { ...draft.filters, excludeGlobs: e.target.value.split('\n').filter(Boolean) } })
            }
            className="input h-24"
          />
        </Row>
        <Row label="Max file size">
          <input
            type="number"
            value={Math.round(draft.filters.maxFileSizeBytes / 1024)}
            onChange={(e) =>
              set({ filters: { ...draft.filters, maxFileSizeBytes: Number(e.target.value) * 1024 } })
            }
            className="input"
          />
          <span className="text-xs text-text-faint">KB</span>
        </Row>
        <Toggle
          label="Respect .gitignore"
          value={draft.filters.respectGitignore}
          onChange={(v) => set({ filters: { ...draft.filters, respectGitignore: v } })}
        />
        <Toggle
          label="Skip binary files"
          value={draft.filters.skipBinaries}
          onChange={(v) => set({ filters: { ...draft.filters, skipBinaries: v } })}
        />
        <Toggle
          label="Exclude secrets (.env, *.pem, SSH keys)"
          value={draft.filters.excludeSecrets}
          onChange={(v) => set({ filters: { ...draft.filters, excludeSecrets: v } })}
        />
      </Section>

      <Section title="Triggers">
        <Row label="Debounce (ms)">
          <input
            type="number"
            value={draft.triggers.debounceMs}
            onChange={(e) =>
              set({ triggers: { ...draft.triggers, debounceMs: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
        <Toggle
          label="On any change (not just save)"
          value={draft.triggers.onAnyChange}
          onChange={(v) => set({ triggers: { ...draft.triggers, onAnyChange: v } })}
        />
      </Section>

      <Section title="Retention">
        <Row label="Keep every version (days)">
          <input
            type="number"
            value={draft.retention.keepAllDays}
            onChange={(e) =>
              set({ retention: { ...draft.retention, keepAllDays: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
        <Row label="Then hourly until (days)">
          <input
            type="number"
            value={draft.retention.hourlyDays}
            onChange={(e) =>
              set({ retention: { ...draft.retention, hourlyDays: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
        <Row label="Then daily until (days)">
          <input
            type="number"
            value={draft.retention.dailyDays}
            onChange={(e) =>
              set({ retention: { ...draft.retention, dailyDays: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
        <Row label="Then weekly until (days)">
          <input
            type="number"
            value={draft.retention.weeklyDays}
            onChange={(e) =>
              set({ retention: { ...draft.retention, weeklyDays: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
        <Row label="Hard delete after (days, 0 = never)">
          <input
            type="number"
            value={draft.retention.maxAgeDays}
            onChange={(e) =>
              set({ retention: { ...draft.retention, maxAgeDays: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
        <Row label="Storage cap (MB, 0 = unlimited)">
          <input
            type="number"
            value={Math.round(draft.retention.maxBytes / 1024 / 1024)}
            onChange={(e) =>
              set({
                retention: { ...draft.retention, maxBytes: Number(e.target.value) * 1024 * 1024 }
              })
            }
            className="input"
          />
        </Row>
        <Row label="Max versions per file (0 = unlimited)">
          <input
            type="number"
            value={draft.retention.maxVersionsPerFile}
            onChange={(e) =>
              set({ retention: { ...draft.retention, maxVersionsPerFile: Number(e.target.value) } })
            }
            className="input"
          />
        </Row>
      </Section>

      <Section title="Security">
        <Toggle
          label="Encrypt blobs (AES-256-GCM)"
          value={draft.security.encrypt}
          onChange={(v) => set({ security: { encrypt: v } })}
        />
      </Section>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border bg-bg-panel/60 px-4 py-3">
        <button onClick={onRemove} className="btn-danger">
          Remove scope
        </button>
        <button onClick={() => onSave(draft)} className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save rules'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="mb-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="label mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-text-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg-card px-3 py-2 text-xs">
      <span className="text-text-muted">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function AddScopeModal({
  onClose,
  onAdded
}: {
  onClose: () => void
  onAdded: () => void
}): JSX.Element {
  const [path, setPath] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<ScopePreset>('code')
  const [estimate, setEstimate] = useState<DryRunEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const runEstimate = async (p: string, pre: ScopePreset): Promise<void> => {
    setEstimating(true)
    try {
      const est = await window.api.scopes.dryRun(p, pre)
      setEstimate(est)
    } finally {
      setEstimating(false)
    }
  }

  const chooseFolder = async (): Promise<void> => {
    const p = await window.api.picker.chooseFolder()
    if (!p) return
    setPath(p)
    const parts = p.split(/[\\/]/).filter(Boolean)
    setName(parts[parts.length - 1] ?? p)
    void runEstimate(p, preset)
  }

  const changePreset = (next: ScopePreset): void => {
    setPreset(next)
    if (path) void runEstimate(path, next)
  }

  const submit = async (): Promise<void> => {
    if (!path) return
    setSubmitting(true)
    try {
      const scope = await window.api.scopes.add('folder', path, preset, null)
      if (name && name !== scope.name) {
        await window.api.scopes.update(scope.id, scope.rules, name)
      }
      onAdded()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="panel w-full max-w-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-semibold">Add folder scope</div>
            <div className="text-xs text-text-muted">
              Pick the folder, choose what to capture, and we'll estimate the storage cost.
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="label mb-1">Folder</div>
            <div className="flex items-center gap-2">
              <input
                value={path ?? ''}
                readOnly
                placeholder="No folder selected"
                className="input"
              />
              <button onClick={chooseFolder} className="btn-secondary">
                Browse...
              </button>
            </div>
          </div>
          <div>
            <div className="label mb-1">Display name</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. my-project"
              className="input"
            />
          </div>
          <div>
            <div className="label mb-1">What to capture</div>
            <div className="grid grid-cols-3 gap-2">
              {(['code', 'documents', 'everything'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => changePreset(p)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    preset === p
                      ? 'border-border-strong bg-bg-card'
                      : 'border-border bg-bg-subtle hover:border-border-strong'
                  }`}
                >
                  <div className="text-sm font-medium capitalize">{p}</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {p === 'code'
                      ? 'Source files, configs, docs'
                      : p === 'documents'
                        ? 'Markdown, .txt, .docx, notes'
                        : 'All text files'}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="card flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-text-muted">Estimate</span>
            <span className="text-text">
              {!path
                ? 'Pick a folder to estimate'
                : estimating
                  ? 'Scanning...'
                  : estimate
                    ? `${estimate.matchedFiles.toLocaleString()} files · ~${formatBytes(estimate.estimatedBytesPerWeek)}/week`
                    : ''}
            </span>
          </div>
          <p className="text-[11px] text-text-faint">
            You can fine-tune retention, encryption, and excludes after creation by selecting the
            scope on the left.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!path || submitting}
            className="btn-primary"
          >
            {submitting ? 'Adding...' : 'Add scope'}
          </button>
        </div>
      </div>
    </div>
  )
}
