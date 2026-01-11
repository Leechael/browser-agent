import { useState, useEffect } from 'react'
import type { RecordingState, ExtensionSettings, Macro } from '@/utils/types'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import CookieSync from '@/components/CookieSync'
import MacroRecorder from '@/components/MacroRecorder'
import MacroList from '@/components/MacroList'
import Settings from '@/components/Settings'

type Tab = 'cookies' | 'macros' | 'settings'
const ACTIVE_TAB_KEY = 'popup_active_tab'

interface AppState {
  recording: RecordingState | null
  currentMacro: Macro | null
  serverConnected: boolean | null
  settings: ExtensionSettings | null
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('cookies')
  const [state, setState] = useState<AppState>({
    recording: null,
    currentMacro: null,
    serverConnected: null,
    settings: null,
  })
  const [loading, setLoading] = useState(true)

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
        settings: response.settings,
      })
    } catch (error) {
      console.error('Failed to get state:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTabChange = (value: string) => {
    const tab = value as Tab
    setActiveTab(tab)
    browser.storage.local.set({ [ACTIVE_TAB_KEY]: tab })
  }

  useEffect(() => {
    // Restore saved active tab (migrate old values)
    browser.storage.local.get(ACTIVE_TAB_KEY).then((data) => {
      let savedTab = data[ACTIVE_TAB_KEY] as string | undefined
      // Migrate old 'recorder' tab to 'macros'
      if (savedTab === 'recorder') savedTab = 'macros'
      if (savedTab && ['cookies', 'macros', 'settings'].includes(savedTab)) {
        setActiveTab(savedTab as Tab)
      }
    })

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

  if (loading) {
    return (
      <div className="w-[360px] h-[500px] flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const isRecording = state.recording?.isRecording ?? false

  return (
    <div className="w-[360px] h-[500px] flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-primary">
        <h1 className="text-base font-semibold text-primary-foreground">Browser Agent</h1>
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            state.serverConnected
              ? 'bg-green-500'
              : 'bg-red-500'
          }`}
          title={state.serverConnected ? 'Server connected' : 'Server disconnected'}
        />
      </header>

      {/* Content with Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col min-h-0 gap-0"
      >
        <TabsList className="w-full shrink-0">
          <TabsTab value="cookies">Cookies</TabsTab>
          <TabsTab value="macros" className="gap-1">
            Macros
            {isRecording && (
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </TabsTab>
          <TabsTab value="settings">Settings</TabsTab>
        </TabsList>

        <div className="flex-1 overflow-y-auto min-h-0">
          <TabsPanel value="cookies" className="p-4">
            <CookieSync serverConnected={state.serverConnected ?? false} />
          </TabsPanel>
          <TabsPanel value="macros" className="p-4">
            <div className="space-y-4">
              {/* Recorder Section */}
              <MacroRecorder
                state={state.recording}
                currentMacro={state.currentMacro}
                onStateChange={refreshState}
              />

              {/* Divider - only show when not recording */}
              {!isRecording && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Saved Macros</span>
                    </div>
                  </div>

                  {/* Macros List */}
                  <MacroList serverConnected={state.serverConnected ?? false} />
                </>
              )}
            </div>
          </TabsPanel>
          <TabsPanel value="settings" className="p-4">
            <Settings settings={state.settings} onSettingsChange={refreshState} />
          </TabsPanel>
        </div>
      </Tabs>
    </div>
  )
}

export default App
