import type { Client } from 'chrome-remote-interface'
import type { MacroAction, PlaybackOptions, PlaybackError, PlaybackResult, PlaybackRequest } from './types'
import { openPage } from '@/actions/common/openPage'
import { waitForElement } from '@/actions/common/waitForElement'
import { clickElement } from '@/actions/common/clickElement'
import { typeHumanLike } from '@/actions/common/typeHumanLike'
import { getRandomDelay, HUMAN_DELAY } from '@/actions/common/getRandomDelay'

const DEFAULT_OPTIONS: PlaybackOptions = {
  speed: 1,
  humanize: true,
  stopOnError: true,
}

/**
 * Wait for page to settle after actions that may trigger async operations
 */
async function waitForSettled(ms: number = 300): Promise<void> {
  await new Promise(r => setTimeout(r, ms))
}

/**
 * Execute a navigate action
 */
async function executeNavigate(
  client: Client,
  action: MacroAction
): Promise<void> {
  if (!action.value) return

  const { Page } = client
  await Page.navigate({ url: action.value })
  await Page.loadEventFired()
  await waitForSettled(500)
}

/**
 * Execute a click action
 */
async function executeClick(
  client: Client,
  action: MacroAction
): Promise<void> {
  const { Input } = client

  if (action.coordinates) {
    const { x, y } = action.coordinates
    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  } else if (action.selector) {
    await waitForElement(client, action.selector, 10000)
    await clickElement(client, action.selector)
  }

  await waitForSettled(500)
}

/**
 * Execute a double-click action
 */
async function executeDblClick(
  client: Client,
  action: MacroAction
): Promise<void> {
  const { Input } = client

  if (action.coordinates) {
    const { x, y } = action.coordinates
    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await new Promise(r => setTimeout(r, 50))
    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 2 })
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 2 })
  } else if (action.selector) {
    await waitForElement(client, action.selector, 10000)
    await clickElement(client, action.selector)
    await new Promise(r => setTimeout(r, 50))
    await clickElement(client, action.selector)
  }

  await waitForSettled(500)
}

/**
 * Execute a type action
 */
async function executeType(
  client: Client,
  action: MacroAction
): Promise<void> {
  if (action.value === undefined) return

  const { Input } = client

  // Click the input field first
  if (action.coordinates) {
    const { x, y } = action.coordinates
    await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  } else if (action.selector) {
    await waitForElement(client, action.selector, 10000)
    await clickElement(client, action.selector)
  }

  await new Promise(r => setTimeout(r, 100))
  await typeHumanLike(client, action.value)
  await waitForSettled(500)
}

/**
 * Execute a keypress action
 */
async function executeKeypress(
  client: Client,
  action: MacroAction
): Promise<void> {
  if (!action.keyInfo) return

  const { Input } = client
  const { key, code, modifiers } = action.keyInfo
  const hasModifier = modifiers.ctrl || modifiers.alt || modifiers.shift || modifiers.meta

  // Press modifiers
  if (modifiers.ctrl) await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Control', code: 'ControlLeft' })
  if (modifiers.alt) await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Alt', code: 'AltLeft' })
  if (modifiers.shift) await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Shift', code: 'ShiftLeft' })
  if (modifiers.meta) await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Meta', code: 'MetaLeft' })

  // CDP modifier flags: alt=1, ctrl=2, meta=4, shift=8
  const modifierFlags =
    (modifiers.alt ? 1 : 0) |
    (modifiers.ctrl ? 2 : 0) |
    (modifiers.meta ? 4 : 0) |
    (modifiers.shift ? 8 : 0)

  await Input.dispatchKeyEvent({ type: 'keyDown', key, code, modifiers: modifierFlags })
  await Input.dispatchKeyEvent({ type: 'keyUp', key, code, modifiers: modifierFlags })

  // Release modifiers in reverse order
  if (modifiers.meta) await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Meta', code: 'MetaLeft' })
  if (modifiers.shift) await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Shift', code: 'ShiftLeft' })
  if (modifiers.alt) await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Alt', code: 'AltLeft' })
  if (modifiers.ctrl) await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Control', code: 'ControlLeft' })

  // Wait for UI changes triggered by shortcuts
  if (hasModifier || key === 'Enter' || key === 'Tab') {
    await waitForSettled(500)
  }
}

/**
 * Execute a scroll action
 */
async function executeScroll(
  client: Client,
  action: MacroAction
): Promise<void> {
  if (!action.scrollDelta) return

  const { Runtime } = client
  const { deltaX, deltaY } = action.scrollDelta

  if (action.selector === 'window') {
    await Runtime.evaluate({
      expression: `window.scrollTo(${deltaX}, ${deltaY})`
    })
  } else if (action.selector) {
    const escapedSelector = action.selector.replace(/'/g, "\\'")
    await Runtime.evaluate({
      expression: `(() => {
        const el = document.querySelector('${escapedSelector}');
        if (el) {
          el.scrollLeft = ${deltaX};
          el.scrollTop = ${deltaY};
        }
      })()`
    })
  }
}

/**
 * Execute a select action
 */
async function executeSelect(
  client: Client,
  action: MacroAction
): Promise<void> {
  if (!action.selector || action.value === undefined) return

  const { Runtime } = client
  await waitForElement(client, action.selector, 10000)

  const escapedSelector = action.selector.replace(/'/g, "\\'")
  const escapedValue = action.value.replace(/'/g, "\\'")
  await Runtime.evaluate({
    expression: `document.querySelector('${escapedSelector}').value = '${escapedValue}'`
  })
}

/**
 * Execute a wait action
 */
async function executeWait(action: MacroAction): Promise<void> {
  if (action.waitDuration) {
    await new Promise(r => setTimeout(r, action.waitDuration))
  }
}

/**
 * Execute a single macro action
 */
async function executeAction(
  client: Client,
  action: MacroAction
): Promise<void> {
  switch (action.type) {
    case 'navigate':
      return executeNavigate(client, action)
    case 'click':
      return executeClick(client, action)
    case 'dblclick':
      return executeDblClick(client, action)
    case 'type':
      return executeType(client, action)
    case 'keypress':
      return executeKeypress(client, action)
    case 'scroll':
      return executeScroll(client, action)
    case 'select':
      return executeSelect(client, action)
    case 'wait':
      return executeWait(action)
    case 'hover':
      // TODO: Implement hover action
      break
  }
}

/**
 * Calculate delay between actions
 */
function getActionDelay(options: PlaybackOptions): number {
  const baseDelay = 100 / options.speed
  if (options.humanize) {
    return getRandomDelay(HUMAN_DELAY.CLICK.MIN, HUMAN_DELAY.CLICK.MAX) / options.speed
  }
  return baseDelay
}

/**
 * Run a macro and return the result
 */
export async function runMacro(request: PlaybackRequest): Promise<PlaybackResult> {
  const { macro, options: requestOptions } = request
  const options = { ...DEFAULT_OPTIONS, ...requestOptions }

  const startTime = Date.now()
  const errors: PlaybackError[] = []
  let executedActions = 0

  console.log(`[${new Date().toISOString()}] Starting macro playback: ${macro.name}`)
  console.log(`[${new Date().toISOString()}] Actions: ${macro.actions.length}, Speed: ${options.speed}x`)

  const { client } = await openPage({ url: macro.startUrl })

  try {
    const { Page, Runtime, Emulation } = client
    await Promise.all([Page.enable(), Runtime.enable()])

    // Wait for initial page to settle
    await waitForSettled(500)

    // Set viewport if recorded
    if (macro.viewport) {
      console.log(`[${new Date().toISOString()}] Setting viewport to ${macro.viewport.width}x${macro.viewport.height}`)
      await Emulation.setDeviceMetricsOverride({
        width: macro.viewport.width,
        height: macro.viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await new Promise(r => setTimeout(r, 100))
    }

    // Execute actions
    for (let i = 0; i < macro.actions.length; i++) {
      const action = macro.actions[i]
      const actionStartTime = Date.now()

      console.log(`[${new Date().toISOString()}] Executing action ${i + 1}/${macro.actions.length}: ${action.type}`)

      try {
        await executeAction(client, action)
        executedActions++
        console.log(`[${new Date().toISOString()}] Action ${i + 1} completed in ${Date.now() - actionStartTime}ms`)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`[${new Date().toISOString()}] Action ${i + 1} failed:`, errorMsg)

        errors.push({
          actionId: action.id,
          actionIndex: i,
          error: errorMsg,
        })

        if (options.stopOnError) {
          break
        }
      }

      // Delay between actions
      if (i < macro.actions.length - 1) {
        await new Promise(r => setTimeout(r, getActionDelay(options)))
      }
    }

    return {
      success: errors.length === 0,
      macroId: macro.id,
      executedActions,
      totalActions: macro.actions.length,
      duration: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
    }
  } finally {
    await client.close()
  }
}
