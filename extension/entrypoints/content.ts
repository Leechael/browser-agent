import type { Message, RecordingState, MacroAction } from '@/utils/types'
import { EventCapture } from '@/lib/eventCapture'

const eventCapture = new EventCapture()

// Set up event capture callback
eventCapture.setOnAction((action: Omit<MacroAction, 'id' | 'timestamp'>) => {
  browser.runtime.sendMessage({
    type: 'RECORD_ACTION',
    payload: action,
    timestamp: Date.now(),
  } as Message)
})

// Listen for messages from background
browser.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'RECORDING_STATE_CHANGED') {
    const state = message.payload as RecordingState
    if (state.isRecording && !state.isPaused) {
      if (!eventCapture.isActive()) {
        eventCapture.start()
        console.log('[Browser Agent] Recording started')
      }
    } else {
      if (eventCapture.isActive()) {
        eventCapture.stop()
        console.log('[Browser Agent] Recording stopped')
      }
    }
  }
})

// Check recording state on initialization
async function init() {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'GET_STATE',
      payload: {},
      timestamp: Date.now(),
    } as Message)

    if (response?.recording?.isRecording && !response.recording.isPaused) {
      eventCapture.start()
      console.log('[Browser Agent] Recording resumed')
    }
  } catch {
    // Background may not be ready yet
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    console.log('[Browser Agent] Content script loaded')
    init()
  },
})
