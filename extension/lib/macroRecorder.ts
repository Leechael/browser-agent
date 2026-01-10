import type { Macro, MacroAction, RecordingState } from '@/utils/types'
import { STORAGE_KEYS } from '@/utils/constants'

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

export class MacroRecorder {
  private state: RecordingState = {
    isRecording: false,
    currentMacro: null,
    isPaused: false,
    startTime: null,
  }

  private lastActionTime: number = 0
  private minActionInterval: number = 50

  setMinActionInterval(interval: number) {
    this.minActionInterval = interval
  }

  // Start recording
  async startRecording(name: string, startUrl: string, viewport?: { width: number; height: number }): Promise<Macro> {
    const macro: Macro = {
      id: generateId(),
      name,
      startUrl,
      actions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewport,
    }

    this.state = {
      isRecording: true,
      currentMacro: macro,
      isPaused: false,
      startTime: Date.now(),
    }

    this.lastActionTime = 0

    // Save recording state
    await this.saveRecordingState()

    // Notify all content scripts to start recording
    await this.broadcastRecordingState()

    return macro
  }

  // Stop recording
  async stopRecording(): Promise<Macro | null> {
    if (!this.state.currentMacro) return null

    const macro = { ...this.state.currentMacro }
    macro.updatedAt = Date.now()

    // Save to storage
    await this.saveMacro(macro)

    this.state = {
      isRecording: false,
      currentMacro: null,
      isPaused: false,
      startTime: null,
    }

    await this.saveRecordingState()
    await this.broadcastRecordingState()

    return macro
  }

  // Toggle pause/resume recording
  async togglePause(): Promise<boolean> {
    if (!this.state.isRecording) return false
    this.state.isPaused = !this.state.isPaused
    await this.saveRecordingState()
    await this.broadcastRecordingState()
    return this.state.isPaused
  }

  // Record an action
  recordAction(action: Omit<MacroAction, 'id' | 'timestamp'>): boolean {
    if (!this.state.isRecording || this.state.isPaused || !this.state.currentMacro) {
      return false
    }

    const now = Date.now()
    const lastAction = this.state.currentMacro.actions[this.state.currentMacro.actions.length - 1]

    // Only apply interval filter for same action type (to prevent duplicates)
    // Don't filter out different action types (e.g., click right after scroll)
    if (
      lastAction &&
      lastAction.type === action.type &&
      now - this.lastActionTime < this.minActionInterval
    ) {
      return false
    }

    const fullAction: MacroAction = {
      ...action,
      id: generateId(),
      timestamp: now - (this.state.startTime || now),
    }

    // Smart merge consecutive typing actions
    if (
      fullAction.type === 'type' &&
      lastAction?.type === 'type' &&
      lastAction.selector === fullAction.selector &&
      now - this.lastActionTime < 500
    ) {
      // Update the last typing action's value
      lastAction.value = fullAction.value
      lastAction.timestamp = fullAction.timestamp
    } else {
      this.state.currentMacro.actions.push(fullAction)
    }

    this.lastActionTime = now
    this.state.currentMacro.updatedAt = now

    return true
  }

  // Get current state
  getState(): RecordingState {
    return { ...this.state }
  }

  // Get current macro
  getCurrentMacro(): Macro | null {
    return this.state.currentMacro
  }

  // Save recording state
  private async saveRecordingState(): Promise<void> {
    await browser.storage.local.set({
      [STORAGE_KEYS.RECORDING_STATE]: this.state,
    })
  }

  // Restore recording state
  async restoreRecordingState(): Promise<void> {
    const data = await browser.storage.local.get(STORAGE_KEYS.RECORDING_STATE)
    const savedState = data[STORAGE_KEYS.RECORDING_STATE] as RecordingState | undefined
    if (savedState) {
      this.state = savedState
    }
  }

  // Save macro to storage
  private async saveMacro(macro: Macro): Promise<void> {
    const data = await browser.storage.local.get(STORAGE_KEYS.MACROS)
    const macros: Macro[] = (data[STORAGE_KEYS.MACROS] as Macro[]) || []

    const existingIndex = macros.findIndex((m) => m.id === macro.id)
    if (existingIndex >= 0) {
      macros[existingIndex] = macro
    } else {
      macros.push(macro)
    }

    await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: macros })
  }

  // Get all macros
  async getAllMacros(): Promise<Macro[]> {
    const data = await browser.storage.local.get(STORAGE_KEYS.MACROS)
    return (data[STORAGE_KEYS.MACROS] as Macro[]) || []
  }

  // Delete a macro
  async deleteMacro(macroId: string): Promise<boolean> {
    const data = await browser.storage.local.get(STORAGE_KEYS.MACROS)
    const macros: Macro[] = (data[STORAGE_KEYS.MACROS] as Macro[]) || []

    const index = macros.findIndex((m) => m.id === macroId)
    if (index >= 0) {
      macros.splice(index, 1)
      await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: macros })
      return true
    }
    return false
  }

  // Broadcast recording state to all tabs
  private async broadcastRecordingState(): Promise<void> {
    const tabs = await browser.tabs.query({})

    for (const tab of tabs) {
      if (tab.id) {
        try {
          await browser.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STATE_CHANGED',
            payload: this.state,
            timestamp: Date.now(),
          })
        } catch {
          // Tab may not have content script
        }
      }
    }
  }

  // Remove an action
  removeAction(actionId: string): boolean {
    if (!this.state.currentMacro) return false

    const index = this.state.currentMacro.actions.findIndex((a) => a.id === actionId)
    if (index >= 0) {
      this.state.currentMacro.actions.splice(index, 1)
      return true
    }
    return false
  }

  // Insert a wait action
  insertWait(afterActionId: string, duration: number): boolean {
    if (!this.state.currentMacro) return false

    const index = this.state.currentMacro.actions.findIndex((a) => a.id === afterActionId)
    if (index >= 0) {
      const waitAction: MacroAction = {
        id: generateId(),
        type: 'wait',
        timestamp: this.state.currentMacro.actions[index].timestamp,
        selector: '',
        waitDuration: duration,
      }
      this.state.currentMacro.actions.splice(index + 1, 0, waitAction)
      return true
    }
    return false
  }
}
