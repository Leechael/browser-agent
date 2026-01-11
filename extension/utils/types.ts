// Cookie-related types
export interface CookieItem {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expires?: number
  sameSite?: 'Strict' | 'Lax' | 'None'
}

export interface CookieSyncConfig {
  enabled: boolean
  serverUrl: string
  autoSync: boolean
  syncInterval: number
  includedDomains: string[]
  excludedDomains: string[]
}

export interface CookieSyncResult {
  success: boolean
  domain: string
  cookieCount: number
  timestamp: number
  error?: string
}

// Macro recording types
export type MacroActionType =
  | 'navigate'
  | 'click'
  | 'dblclick'
  | 'type'
  | 'keypress'
  | 'scroll'
  | 'select'
  | 'hover'
  | 'wait'

export interface MacroAction {
  id: string
  type: MacroActionType
  timestamp: number
  selector: string
  xpath?: string
  value?: string
  coordinates?: {
    x: number
    y: number
  }
  scrollDelta?: {
    deltaX: number
    deltaY: number
  }
  keyInfo?: {
    key: string
    code: string
    modifiers: {
      ctrl: boolean
      alt: boolean
      shift: boolean
      meta: boolean
    }
  }
  waitDuration?: number
  elementInfo?: {
    tagName: string
    id?: string
    className?: string
    text?: string
  }
}

export interface Macro {
  id: string
  name: string
  description?: string
  startUrl: string
  actions: MacroAction[]
  createdAt: number
  updatedAt: number
  tags?: string[]
  variables?: MacroVariable[]
  viewport?: {
    width: number
    height: number
  }
}

export interface MacroVariable {
  name: string
  type: 'string' | 'number' | 'boolean'
  defaultValue: string | number | boolean
  description?: string
}

export interface RecordingState {
  isRecording: boolean
  currentMacro: Macro | null
  isPaused: boolean
  startTime: number | null
}

export interface PlaybackOptions {
  speed: number
  humanize: boolean
  stopOnError: boolean
  variables?: Record<string, string | number | boolean>
}

export interface PlaybackResult {
  success: boolean
  macroId: string
  executedActions: number
  totalActions: number
  duration: number
  errors?: PlaybackError[]
}

export interface PlaybackError {
  actionId: string
  actionIndex: number
  error: string
  recoverable: boolean
}

// Message communication types
export type MessageType =
  | 'SYNC_COOKIES'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'RECORD_ACTION'
  | 'PLAYBACK_MACRO'
  | 'GET_STATE'
  | 'UPDATE_SETTINGS'
  | 'RECORDING_STATE_CHANGED'

export interface Message<T = unknown> {
  type: MessageType
  payload: T
  tabId?: number
  timestamp: number
}

// Settings types
export interface ExtensionSettings {
  serverUrl: string
  cookieSync: CookieSyncConfig
  recording: {
    captureScroll: boolean
    captureHover: boolean
    generateXPath: boolean
    minActionInterval: number
  }
  playback: PlaybackOptions
}
