import type { Message, ExtensionSettings, MacroAction, Macro, PlaybackOptions } from '@/utils/types'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '@/utils/constants'
import { MacroRecorder } from '@/lib/macroRecorder'
import { CookieSyncManager, setupCookieChangeListener } from '@/lib/cookieSync'
import { initApiClient, getApiClient } from '@/lib/apiClient'

let macroRecorder: MacroRecorder | null = null
let cookieSyncManager: CookieSyncManager | null = null
let settings: ExtensionSettings = DEFAULT_SETTINGS
let initialized = false

async function initialize() {
  if (initialized) return
  initialized = true

  try {
    const stored = await browser.storage.local.get(STORAGE_KEYS.SETTINGS)
    const loaded = stored[STORAGE_KEYS.SETTINGS] as ExtensionSettings | undefined
    if (loaded) {
      settings = loaded
      console.log('[Browser Agent Extension] Settings loaded from storage')
    } else {
      console.log('[Browser Agent Extension] No stored settings, using defaults')
    }
  } catch (err) {
    console.error('[Browser Agent Extension] Failed to load settings from storage:', err)
  }

  // Initialize API client
  initApiClient(settings.serverUrl)

  // Initialize macro recorder
  macroRecorder = new MacroRecorder()
  macroRecorder.setMinActionInterval(settings.recording.minActionInterval)
  await macroRecorder.restoreRecordingState()

  // Initialize cookie sync manager
  cookieSyncManager = new CookieSyncManager(settings.cookieSync)

  // Set up cookie change listener
  if (settings.cookieSync.enabled && settings.cookieSync.autoSync) {
    setupCookieChangeListener(cookieSyncManager)
  }

  console.log('[Browser Agent Extension] Initialized', { id: browser.runtime.id })
}

// Message handler
async function handleMessage(
  message: Message,
  sender: { tab?: { id?: number } }
): Promise<unknown> {
  // Ensure initialization is complete
  await initialize()

  switch (message.type) {
    case 'GET_STATE': {
      let serverConnected = false
      try {
        serverConnected = await getApiClient().healthCheck()
      } catch {
        serverConnected = false
      }
      return {
        recording: macroRecorder?.getState() ?? { isRecording: false, currentMacro: null, isPaused: false, startTime: null },
        currentMacro: macroRecorder?.getCurrentMacro() ?? null,
        serverConnected,
        settings,
      }
    }

    case 'START_RECORDING': {
      if (!macroRecorder) throw new Error('MacroRecorder not initialized')
      const { name, startUrl, viewport } = message.payload as {
        name: string
        startUrl: string
        viewport?: { width: number; height: number }
      }
      const macro = await macroRecorder.startRecording(name, startUrl, viewport)
      return { success: true, macro }
    }

    case 'STOP_RECORDING': {
      if (!macroRecorder) throw new Error('MacroRecorder not initialized')
      const macro = await macroRecorder.stopRecording()
      return { success: true, macro }
    }

    case 'PAUSE_RECORDING': {
      if (!macroRecorder) throw new Error('MacroRecorder not initialized')
      const isPaused = await macroRecorder.togglePause()
      return { success: true, isPaused }
    }

    case 'RECORD_ACTION': {
      if (!macroRecorder) return { success: false }
      const action = message.payload as Omit<MacroAction, 'id' | 'timestamp'>
      const recorded = macroRecorder.recordAction(action)
      return { success: recorded }
    }

    case 'SYNC_COOKIES': {
      if (!cookieSyncManager) throw new Error('CookieSyncManager not initialized')
      const tabId = (message as Message & { tabId?: number }).tabId ?? sender.tab?.id
      if (!tabId) {
        throw new Error('No tab context')
      }
      const result = await cookieSyncManager.syncCurrentTab(tabId)
      return result
    }

    case 'PLAYBACK_MACRO': {
      const { macro, options } = message.payload as {
        macro: Macro
        options: PlaybackOptions
      }
      try {
        const result = await getApiClient().playbackMacro(macro, options)
        return result
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    case 'UPDATE_SETTINGS': {
      const newSettings = message.payload as Partial<ExtensionSettings>
      // Deep merge nested objects to avoid losing properties
      settings = {
        ...settings,
        ...newSettings,
        cookieSync: { ...settings.cookieSync, ...newSettings.cookieSync },
        recording: { ...settings.recording, ...newSettings.recording },
        playback: { ...settings.playback, ...newSettings.playback },
      }

      try {
        await browser.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings })
        console.log('[Browser Agent Extension] Settings saved to storage')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Browser Agent Extension] Failed to save settings:', msg)
        throw new Error(`Storage write failed: ${msg}`)
      }

      // Update services
      try {
        getApiClient().setBaseUrl(settings.serverUrl)
      } catch {
        initApiClient(settings.serverUrl)
      }
      cookieSyncManager?.updateConfig(settings.cookieSync)
      macroRecorder?.setMinActionInterval(settings.recording.minActionInterval)

      return { success: true }
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`)
  }
}

export default defineBackground(() => {
  // Initialize
  initialize()

  // Listen for messages
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message as Message, sender)
      .then((result) => {
        if (result && typeof result === 'object' && 'error' in result) {
          sendResponse({ success: false, error: (result as { error: string }).error })
        } else {
          sendResponse(result)
        }
      })
      .catch((err) => sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) }))
    return true // Keep the message channel open
  })

  // Create context menus on install
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'sync-cookies',
      title: 'Sync cookies to Browser Agent',
      contexts: ['page'],
    })

    browser.contextMenus.create({
      id: 'start-recording',
      title: 'Start macro recording',
      contexts: ['page'],
    })

    browser.contextMenus.create({
      id: 'stop-recording',
      title: 'Stop macro recording',
      contexts: ['page'],
    })
  })

  // Context menu handler
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return

    // Ensure initialization
    await initialize()

    switch (info.menuItemId) {
      case 'sync-cookies':
        if (cookieSyncManager) {
          await cookieSyncManager.syncCurrentTab(tab.id)
        }
        break

      case 'start-recording': {
        if (macroRecorder) {
          const state = macroRecorder.getState()
          if (!state.isRecording && tab.url) {
            await macroRecorder.startRecording('New Recording', tab.url)
          }
        }
        break
      }

      case 'stop-recording': {
        if (macroRecorder) {
          const state = macroRecorder.getState()
          if (state.isRecording) {
            await macroRecorder.stopRecording()
          }
        }
        break
      }
    }
  })
})
