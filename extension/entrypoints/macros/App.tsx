import { useState, useEffect } from 'react'
import type { RecordingState, Macro } from '@/utils/types'
import { STORAGE_KEYS } from '@/utils/constants'
import MacroRecorder from '@/components/MacroRecorder'
import MacroListFull from '@/components/MacroListFull'
import MacroEditor from '@/components/MacroEditor'

interface AppState {
  recording: RecordingState | null
  currentMacro: Macro | null
  serverConnected: boolean | null
}

function App() {
  const [state, setState] = useState<AppState>({
    recording: null,
    currentMacro: null,
    serverConnected: null,
  })
  const [loading, setLoading] = useState(true)
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const refreshState = async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_STATE',
        payload: {},
        timestamp: Date.now(),
      })
      setState({
        recording: response.recording,
        currentMacro: response.currentMacro,
        serverConnected: response.serverConnected,
      })
    } catch (error) {
      console.error('Failed to get state:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshState()

    const handleMessage = (message: { type: string; payload: unknown }) => {
      if (message.type === 'RECORDING_STATE_CHANGED') {
        setState((prev) => ({
          ...prev,
          recording: message.payload as RecordingState,
        }))
      }
    }

    browser.runtime.onMessage.addListener(handleMessage)
    return () => browser.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const handleSaveMacro = async (macro: Macro) => {
    setSaveError(null)
    try {
      const data = await browser.storage.local.get(STORAGE_KEYS.MACROS)
      const macros: Macro[] = (data[STORAGE_KEYS.MACROS] as Macro[]) || []
      const index = macros.findIndex((m) => m.id === macro.id)
      if (index >= 0) {
        macros[index] = macro
      } else {
        macros.push(macro)
      }
      await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: macros })
      setEditingMacro(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save macro'
      setSaveError(message)
      console.error('Failed to save macro:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Show editor if editing
  if (editingMacro) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <MacroEditor
          macro={editingMacro}
          onSave={handleSaveMacro}
          onClose={() => { setEditingMacro(null); setSaveError(null) }}
          error={saveError}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-primary shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-lg font-semibold text-primary-foreground">Browser Agent - Macros</h1>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                state.serverConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
              title={state.serverConnected ? 'Server connected' : 'Server disconnected'}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recorder Panel */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-lg border border-border p-4 sticky top-20">
              <MacroRecorder
                state={state.recording}
                currentMacro={state.currentMacro}
                onStateChange={refreshState}
              />
            </div>
          </div>

          {/* Macros List */}
          <div className="lg:col-span-2">
            <MacroListFull
              serverConnected={state.serverConnected ?? false}
              onEdit={setEditingMacro}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
