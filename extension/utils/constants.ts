import type { ExtensionSettings } from './types'

export const DEFAULT_SERVER_URL = 'http://localhost:3000'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  serverUrl: DEFAULT_SERVER_URL,
  cookieSync: {
    enabled: true,
    serverUrl: DEFAULT_SERVER_URL,
    autoSync: false,
    syncInterval: 60000, // 1 minute
    includedDomains: [],
    excludedDomains: [],
  },
  recording: {
    captureScroll: true,
    captureHover: false,
    generateXPath: true,
    minActionInterval: 50,
  },
  playback: {
    speed: 1.0,
    humanize: true,
    stopOnError: true,
  },
}

export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  MACROS: 'macros',
  SYNC_HISTORY: 'syncHistory',
  RECORDING_STATE: 'recordingState',
} as const
