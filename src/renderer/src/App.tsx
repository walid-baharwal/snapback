import { useEffect, useState } from 'react'
import type { AppPreferences, DaemonStatus } from '@shared/types'
import { Setup } from './pages/Setup'
import { Shell } from './components/Shell'
import { Timeline } from './pages/Timeline'
import { FileHistory } from './pages/FileHistory'
import { Recovery } from './pages/Recovery'
import { RulesManager } from './pages/RulesManager'
import { Storage } from './pages/Storage'
import { Settings } from './pages/Settings'

export type PageKey = 'timeline' | 'history' | 'recovery' | 'rules' | 'storage' | 'settings'

interface AppState {
  prefs: AppPreferences | null
  page: PageKey
  selectedFile: string | null
  status: DaemonStatus
}

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState>({
    prefs: null,
    page: 'timeline',
    selectedFile: null,
    status: { state: 'running', pausedReason: null }
  })

  useEffect(() => {
    void window.api.setup.getPreferences().then((prefs) => setState((s) => ({ ...s, prefs })))
    const off = window.api.events.onStatusChanged((status) =>
      setState((s) => ({ ...s, status }))
    )
    return off
  }, [])

  if (!state.prefs) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">Loading...</div>
    )
  }

  if (!state.prefs.setupComplete) {
    return (
      <Setup
        onDone={async () => {
          const prefs = await window.api.setup.getPreferences()
          setState((s) => ({ ...s, prefs }))
        }}
      />
    )
  }

  const select = (filePath: string): void =>
    setState((s) => ({ ...s, page: 'history', selectedFile: filePath }))

  return (
    <Shell
      page={state.page}
      status={state.status}
      onNavigate={(page) => setState((s) => ({ ...s, page }))}
    >
      {state.page === 'timeline' && <Timeline onSelectFile={select} />}
      {state.page === 'history' && (
        <FileHistory
          filePath={state.selectedFile}
          onPickFile={(p) => setState((s) => ({ ...s, selectedFile: p }))}
        />
      )}
      {state.page === 'recovery' && <Recovery onPickFile={select} />}
      {state.page === 'rules' && <RulesManager />}
      {state.page === 'storage' && <Storage />}
      {state.page === 'settings' && <Settings />}
    </Shell>
  )
}
