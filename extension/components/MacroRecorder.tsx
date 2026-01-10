import { useState, useEffect } from 'react'
import type { RecordingState, Macro } from '@/utils/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface MacroRecorderProps {
  state: RecordingState | null
  currentMacro: Macro | null
  onStateChange: () => void
}

export default function MacroRecorder({ state, currentMacro, onStateChange }: MacroRecorderProps) {
  const [macroName, setMacroName] = useState('New Recording')
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (state?.isRecording && state.startTime) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - state.startTime!) / 1000))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [state?.isRecording, state?.startTime])

  const handleStartRecording = async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    const startUrl = tab?.url || ''

    // Get the viewport size of the current tab
    let viewport: { width: number; height: number } | undefined
    if (tab?.id) {
      try {
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({ width: window.innerWidth, height: window.innerHeight }),
        })
        if (results?.[0]?.result) {
          viewport = results[0].result as { width: number; height: number }
        }
      } catch {
        // Some pages may not allow script execution
      }
    }

    await browser.runtime.sendMessage({
      type: 'START_RECORDING',
      payload: { name: macroName, startUrl, viewport },
      timestamp: Date.now(),
    })

    onStateChange()
  }

  const handleStopRecording = async () => {
    await browser.runtime.sendMessage({
      type: 'STOP_RECORDING',
      payload: {},
      timestamp: Date.now(),
    })

    onStateChange()
    setDuration(0)
  }

  const handlePauseRecording = async () => {
    await browser.runtime.sendMessage({
      type: 'PAUSE_RECORDING',
      payload: {},
      timestamp: Date.now(),
    })

    onStateChange()
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const isRecording = state?.isRecording ?? false
  const isPaused = state?.isPaused ?? false
  const actions = currentMacro?.actions ?? []

  return (
    <div className="space-y-4">
      {!isRecording ? (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            New Recording
          </h3>
          <div className="rounded-lg border border-border p-3 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Macro Name
              </label>
              <Input
                type="text"
                value={macroName}
                onChange={(e) => setMacroName(e.target.value)}
                placeholder="Enter macro name..."
              />
            </div>
            <Button className="w-full" onClick={handleStartRecording}>
              Start Recording
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Recording
            </h3>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`text-sm font-medium ${isPaused ? 'text-amber-500' : 'text-green-500'}`}>
                  {isPaused ? 'Paused' : 'Recording...'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm font-medium font-mono">{formatDuration(duration)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Actions</span>
                <span className="text-sm font-medium">{actions.length}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <Button variant="destructive" className="flex-1" onClick={handleStopRecording}>
                Stop
              </Button>
              <Button variant="secondary" className="flex-1" onClick={handlePauseRecording}>
                {isPaused ? 'Resume' : 'Pause'}
              </Button>
            </div>
          </div>

          {actions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Recent Actions
              </h3>
              <div className="rounded-lg border border-border overflow-hidden max-h-48 overflow-y-auto">
                {actions
                  .slice(-5)
                  .reverse()
                  .map((action, index) => (
                    <div
                      key={action.id || index}
                      className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-b-0"
                    >
                      <span className="px-1.5 py-0.5 text-xs font-semibold uppercase bg-blue-100 text-blue-700 rounded">
                        {action.type}
                      </span>
                      <span className="flex-1 text-xs text-muted-foreground truncate">
                        {action.type === 'type'
                          ? `"${action.value?.slice(0, 20)}${(action.value?.length ?? 0) > 20 ? '...' : ''}"`
                          : action.selector.slice(0, 30)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
