import { useState } from 'react'
import type { ScopePreset } from '@shared/types'
import { formatBytes } from '../lib/format'

interface FolderEntry {
  path: string
  preset: ScopePreset
  matched?: number
  bytesPerWeek?: number
  loading?: boolean
}

interface Props {
  onDone: () => void
}

type Step = 'welcome' | 'mode' | 'folders' | 'review'

export function Setup({ onDone }: Props): JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [mode, setMode] = useState<'folders' | 'machine' | null>(null)
  const [folders, setFolders] = useState<FolderEntry[]>([])
  const [submitting, setSubmitting] = useState(false)

  const addFolder = async (): Promise<void> => {
    const p = await window.api.picker.chooseFolder()
    if (!p) return
    const entry: FolderEntry = { path: p, preset: 'code', loading: true }
    setFolders((f) => [...f, entry])
    const est = await window.api.scopes.dryRun(p, 'code')
    setFolders((f) =>
      f.map((x) =>
        x.path === p
          ? { ...x, matched: est.matchedFiles, bytesPerWeek: est.estimatedBytesPerWeek, loading: false }
          : x
      )
    )
  }

  const changePreset = async (idx: number, preset: ScopePreset): Promise<void> => {
    const f = folders[idx]
    setFolders((all) => all.map((x, i) => (i === idx ? { ...x, preset, loading: true } : x)))
    const est = await window.api.scopes.dryRun(f.path, preset)
    setFolders((all) =>
      all.map((x, i) =>
        i === idx
          ? { ...x, preset, matched: est.matchedFiles, bytesPerWeek: est.estimatedBytesPerWeek, loading: false }
          : x
      )
    )
  }

  const removeFolder = (idx: number): void =>
    setFolders((all) => all.filter((_, i) => i !== idx))

  const submit = async (): Promise<void> => {
    if (!mode) return
    setSubmitting(true)
    await window.api.setup.complete(
      mode,
      mode === 'folders' ? folders.map((f) => ({ path: f.path, preset: f.preset })) : []
    )
    onDone()
  }

  return (
    <div className="grid h-full place-items-center bg-bg p-8">
      <div className="w-full max-w-3xl">
        <Progress step={step} />
        <div className="panel mt-6 overflow-hidden">
          {step === 'welcome' && <Welcome onNext={() => setStep('mode')} />}
          {step === 'mode' && (
            <ModeStep
              mode={mode}
              setMode={setMode}
              onBack={() => setStep('welcome')}
              onNext={() => setStep(mode === 'machine' ? 'review' : 'folders')}
            />
          )}
          {step === 'folders' && (
            <FoldersStep
              folders={folders}
              onAdd={addFolder}
              onChangePreset={changePreset}
              onRemove={removeFolder}
              onBack={() => setStep('mode')}
              onNext={() => setStep('review')}
            />
          )}
          {step === 'review' && (
            <ReviewStep
              mode={mode!}
              folders={folders}
              submitting={submitting}
              onBack={() => setStep(mode === 'machine' ? 'mode' : 'folders')}
              onSubmit={submit}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Progress({ step }: { step: Step }): JSX.Element {
  const steps: Step[] = ['welcome', 'mode', 'folders', 'review']
  return (
    <div className="flex items-center gap-2 text-xs text-text-faint">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full border ${
              s === step
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-border bg-bg-card text-text-muted'
            }`}
          >
            {i + 1}
          </span>
          <span className={s === step ? 'text-text' : ''}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-6 bg-border" />}
        </div>
      ))}
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }): JSX.Element {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Welcome to Snapback</h1>
      <p className="mt-2 max-w-lg text-text-muted">
        Snapback quietly takes a versioned snapshot every time you save a file. Browse a visual
        daily timeline, restore any earlier version, and bring back files you deleted by accident.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        <Feature title="Auto retention" body="Keep everything for a window, thin to daily/weekly, auto-delete after a month." />
        <Feature title="Scoped rules" body="Global defaults plus per-folder and per-file-type overrides." />
        <Feature title="Local-first" body="Everything stays on your machine. Optional per-scope encryption." />
      </div>
      <div className="mt-8 flex justify-end">
        <button onClick={onNext} className="btn-primary">
          Get started
        </button>
      </div>
    </div>
  )
}

function Feature({ title, body }: { title: string; body: string }): JSX.Element {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium text-text">{title}</div>
      <div className="mt-1 text-xs text-text-muted">{body}</div>
    </div>
  )
}

function ModeStep({
  mode,
  setMode,
  onBack,
  onNext
}: {
  mode: 'folders' | 'machine' | null
  setMode: (m: 'folders' | 'machine') => void
  onBack: () => void
  onNext: () => void
}): JSX.Element {
  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold">What should Snapback protect?</h2>
      <p className="mt-1 text-sm text-text-muted">You can change this anytime in Rules.</p>
      <div className="mt-6 grid gap-3">
        <ChoiceCard
          active={mode === 'folders'}
          title="Specific folders"
          body="Recommended. Pick the folders you care about (projects, documents). Lighter, more precise."
          onClick={() => setMode('folders')}
        />
        <ChoiceCard
          active={mode === 'machine'}
          title="Whole machine"
          body="Watch your home directory with smart excludes (node_modules, caches, system folders)."
          onClick={() => setMode('machine')}
        />
      </div>
      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button onClick={onNext} className="btn-primary" disabled={!mode}>
          Continue
        </button>
      </div>
    </div>
  )
}

function ChoiceCard({
  active,
  title,
  body,
  onClick
}: {
  active: boolean
  title: string
  body: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`card flex w-full items-start gap-3 p-4 text-left transition-all ${
        active ? 'border-border-strong bg-bg-card' : 'hover:border-border-strong'
      }`}
    >
      <span
        className={`mt-1 h-3 w-3 rounded-full border ${
          active ? 'border-accent bg-accent' : 'border-border'
        }`}
      />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-text-muted">{body}</span>
      </span>
    </button>
  )
}

function FoldersStep({
  folders,
  onAdd,
  onChangePreset,
  onRemove,
  onBack,
  onNext
}: {
  folders: FolderEntry[]
  onAdd: () => void
  onChangePreset: (idx: number, p: ScopePreset) => void
  onRemove: (idx: number) => void
  onBack: () => void
  onNext: () => void
}): JSX.Element {
  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold">Add folders to protect</h2>
      <p className="mt-1 text-sm text-text-muted">
        Pick presets (Code, Documents, Everything) per folder. We estimate file count and weekly
        storage.
      </p>
      <div className="mt-4 space-y-2">
        {folders.length === 0 && (
          <div className="card p-6 text-center text-sm text-text-muted">
            No folders yet. Add one to continue.
          </div>
        )}
        {folders.map((f, i) => (
          <div key={f.path} className="card flex items-center gap-3 p-3">
            <div className="flex-1 truncate text-sm">{f.path}</div>
            <select
              value={f.preset}
              onChange={(e) => onChangePreset(i, e.target.value as ScopePreset)}
              className="input w-32"
            >
              <option value="code">Code</option>
              <option value="documents">Documents</option>
              <option value="everything">Everything</option>
            </select>
            <span className="chip">
              {f.loading
                ? 'estimating...'
                : `${f.matched?.toLocaleString() ?? 0} files · ~${formatBytes(f.bytesPerWeek ?? 0)}/week`}
            </span>
            <button onClick={() => onRemove(i)} className="btn-ghost">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <button onClick={onAdd} className="btn-secondary">
          + Add folder
        </button>
      </div>
      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button onClick={onNext} className="btn-primary" disabled={folders.length === 0}>
          Review
        </button>
      </div>
    </div>
  )
}

function ReviewStep({
  mode,
  folders,
  submitting,
  onBack,
  onSubmit
}: {
  mode: 'folders' | 'machine'
  folders: FolderEntry[]
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}): JSX.Element {
  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold">Ready</h2>
      <p className="mt-1 text-sm text-text-muted">
        You can fine-tune everything from the Rules page later.
      </p>
      <div className="card mt-4 p-4 text-sm">
        <div className="text-text-muted">Mode</div>
        <div className="mt-1 font-medium">
          {mode === 'machine' ? 'Whole machine (smart excludes)' : 'Specific folders'}
        </div>
        {mode === 'folders' && (
          <div className="mt-4 space-y-1">
            {folders.map((f) => (
              <div key={f.path} className="flex items-center justify-between text-xs text-text-muted">
                <span className="truncate">{f.path}</span>
                <span className="chip">{f.preset}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-ghost">
          Back
        </button>
        <button onClick={onSubmit} className="btn-primary" disabled={submitting}>
          {submitting ? 'Setting up...' : 'Start Snapback'}
        </button>
      </div>
    </div>
  )
}
