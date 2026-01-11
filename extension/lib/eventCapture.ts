import type { MacroAction } from '@/utils/types'
import { generateSelector, generateXPath, getElementInfo } from './domUtils'

export interface EventCaptureConfig {
  captureScroll: boolean
  captureHover: boolean
  generateXPath: boolean
}

interface PendingInput {
  element: HTMLInputElement | HTMLTextAreaElement
  selector: string
  xpath?: string
  elementInfo: ReturnType<typeof getElementInfo>
}

export class EventCapture {
  private isCapturing: boolean = false
  private config: EventCaptureConfig = {
    captureScroll: true,
    captureHover: false,
    generateXPath: true,
  }
  private boundHandlers: Map<string, EventListener> = new Map()
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null
  private isComposing: boolean = false
  private pendingInput: PendingInput | null = null
  private onAction: ((action: Omit<MacroAction, 'id' | 'timestamp'>) => void) | null = null

  setOnAction(callback: (action: Omit<MacroAction, 'id' | 'timestamp'>) => void) {
    this.onAction = callback
  }

  start(config?: Partial<EventCaptureConfig>) {
    if (this.isCapturing) return

    if (config) {
      this.config = { ...this.config, ...config }
    }

    this.isCapturing = true
    this.attachListeners()
  }

  stop() {
    if (!this.isCapturing) return

    // Flush any pending input before stopping
    this.flushPendingInput()

    this.isCapturing = false
    this.isComposing = false
    this.pendingInput = null
    this.detachListeners()

    // Clean up timeouts
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
      this.scrollTimeout = null
    }
  }

  // Flush pending input action (called on blur, click elsewhere, Tab, etc.)
  private flushPendingInput() {
    if (!this.pendingInput) return

    const { element, selector, xpath, elementInfo } = this.pendingInput
    const value = element.value

    // Only send if there's actual content (not empty string)
    if (value) {
      const action: Omit<MacroAction, 'id' | 'timestamp'> = {
        type: 'type',
        selector,
        xpath,
        value,
        elementInfo,
      }
      this.sendAction(action)
    }

    this.pendingInput = null
  }

  isActive(): boolean {
    return this.isCapturing
  }

  private attachListeners() {
    // Page unload - flush pending input before navigation
    const beforeUnloadHandler = () => this.flushPendingInput()
    window.addEventListener('beforeunload', beforeUnloadHandler)
    this.boundHandlers.set('beforeunload', beforeUnloadHandler as EventListener)

    const pageHideHandler = () => this.flushPendingInput()
    window.addEventListener('pagehide', pageHideHandler)
    this.boundHandlers.set('pagehide', pageHideHandler as EventListener)

    // Click
    const clickHandler = (e: Event) => this.handleClick(e as MouseEvent)
    document.addEventListener('click', clickHandler, true)
    this.boundHandlers.set('click', clickHandler)

    // Double click
    const dblclickHandler = (e: Event) => this.handleDblClick(e as MouseEvent)
    document.addEventListener('dblclick', dblclickHandler, true)
    this.boundHandlers.set('dblclick', dblclickHandler)

    // Input (for typing) - track pending input, flush on blur/click elsewhere
    const inputHandler = (e: Event) => this.handleInput(e)
    document.addEventListener('input', inputHandler, true)
    this.boundHandlers.set('input', inputHandler)

    // Blur - flush pending input when leaving the field
    const blurHandler = (e: Event) => this.handleBlur(e)
    document.addEventListener('blur', blurHandler, true)
    this.boundHandlers.set('blur', blurHandler)

    // IME composition events
    const compositionStartHandler = () => { this.isComposing = true }
    const compositionEndHandler = () => { this.isComposing = false }
    document.addEventListener('compositionstart', compositionStartHandler, true)
    document.addEventListener('compositionend', compositionEndHandler, true)
    this.boundHandlers.set('compositionstart', compositionStartHandler)
    this.boundHandlers.set('compositionend', compositionEndHandler)

    // Keydown (for special keys - only non-text-editing keys)
    const keydownHandler = (e: Event) => this.handleKeydown(e as KeyboardEvent)
    document.addEventListener('keydown', keydownHandler, true)
    this.boundHandlers.set('keydown', keydownHandler)

    // Scroll
    if (this.config.captureScroll) {
      const scrollHandler = (e: Event) => this.handleScroll(e)
      document.addEventListener('scroll', scrollHandler, true)
      this.boundHandlers.set('scroll', scrollHandler)
    }

    // Select change
    const changeHandler = (e: Event) => this.handleChange(e)
    document.addEventListener('change', changeHandler, true)
    this.boundHandlers.set('change', changeHandler)
  }

  private detachListeners() {
    const windowEvents = ['beforeunload', 'pagehide']
    for (const [event, handler] of this.boundHandlers) {
      if (windowEvents.includes(event)) {
        window.removeEventListener(event, handler)
      } else {
        document.removeEventListener(event, handler, true)
      }
    }
    this.boundHandlers.clear()
  }

  private sendAction(action: Omit<MacroAction, 'id' | 'timestamp'>) {
    if (this.onAction) {
      this.onAction(action)
    }
  }

  private handleClick(e: MouseEvent) {
    const target = e.target as Element
    if (!target) return

    // Ignore clicks on certain elements
    if (this.shouldIgnoreElement(target)) return

    // Flush pending input if clicking on a different element
    if (this.pendingInput && this.pendingInput.element !== target) {
      this.flushPendingInput()
    }

    try {
      const action: Omit<MacroAction, 'id' | 'timestamp'> = {
        type: 'click',
        selector: generateSelector(target),
        xpath: this.config.generateXPath ? generateXPath(target) : undefined,
        coordinates: { x: e.clientX, y: e.clientY },
        elementInfo: getElementInfo(target),
      }

      this.sendAction(action)
    } catch (err) {
      // Fallback: at minimum record the coordinates
      console.error('[Browser Agent] Error recording click:', err)
      const action: Omit<MacroAction, 'id' | 'timestamp'> = {
        type: 'click',
        selector: '',
        coordinates: { x: e.clientX, y: e.clientY },
      }
      this.sendAction(action)
    }
  }

  private handleDblClick(e: MouseEvent) {
    const target = e.target as Element
    if (!target || this.shouldIgnoreElement(target)) return

    // Flush pending input if double-clicking on a different element
    if (this.pendingInput && this.pendingInput.element !== target) {
      this.flushPendingInput()
    }

    const action: Omit<MacroAction, 'id' | 'timestamp'> = {
      type: 'dblclick',
      selector: generateSelector(target),
      xpath: this.config.generateXPath ? generateXPath(target) : undefined,
      coordinates: { x: e.clientX, y: e.clientY },
      elementInfo: getElementInfo(target),
    }

    this.sendAction(action)
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    if (!target) return

    // Skip during IME composition - wait for compositionend
    if (this.isComposing) return

    // Only process text input
    if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) return
    if (
      target.tagName === 'INPUT' &&
      !['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(target.type)
    )
      return

    // If typing in a different element, flush the previous one first
    if (this.pendingInput && this.pendingInput.element !== target) {
      this.flushPendingInput()
    }

    // Track this input - will be flushed on blur/click elsewhere/Tab
    this.pendingInput = {
      element: target,
      selector: generateSelector(target),
      xpath: this.config.generateXPath ? generateXPath(target) : undefined,
      elementInfo: getElementInfo(target),
    }
  }

  private handleBlur(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    if (!target) return

    // Flush pending input if this is the element we were tracking
    if (this.pendingInput && this.pendingInput.element === target) {
      this.flushPendingInput()
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    const target = e.target as Element
    const isTextInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

    // Skip standalone modifier keys - we only care about the actual key + modifiers
    const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta']
    if (modifierKeys.includes(e.key)) return

    // Skip if composing (IME), except for Enter/Tab which end composition
    if (this.isComposing && e.key !== 'Enter' && e.key !== 'Tab') return

    const hasModifier = e.ctrlKey || e.metaKey || e.altKey

    // Flush pending input before any shortcut or special key
    // (shortcuts might close modals, change focus, or navigate)
    if (hasModifier || ['Enter', 'Escape', 'Tab'].includes(e.key)) {
      this.flushPendingInput()
    }

    // For text inputs, only record Enter (form submit), Escape, Tab (focus change)
    // Backspace, Delete, Arrow keys are text editing - their effect is captured by input event
    if (isTextInput) {
      const textFieldSpecialKeys = ['Enter', 'Escape', 'Tab']

      // Record modifier combinations (Ctrl+A, Cmd+V, etc.) or special navigation keys
      if (!textFieldSpecialKeys.includes(e.key) && !hasModifier) return
    } else {
      // For non-text elements, record navigation keys and modifier combinations
      const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']

      if (!specialKeys.includes(e.key) && !hasModifier) return
    }

    const action: Omit<MacroAction, 'id' | 'timestamp'> = {
      type: 'keypress',
      selector: generateSelector(target),
      keyInfo: {
        key: e.key,
        code: e.code,
        modifiers: {
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
          meta: e.metaKey,
        },
      },
      elementInfo: getElementInfo(target),
    }

    this.sendAction(action)
  }

  private handleScroll(e: Event) {
    // Debounce scroll events
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout)
    }

    const target = e.target as Element | Document

    this.scrollTimeout = setTimeout(() => {
      let selector: string
      let scrollX: number
      let scrollY: number

      if (target === document || target === document.documentElement) {
        // Window/document scroll
        selector = 'window'
        scrollX = window.scrollX
        scrollY = window.scrollY
      } else if (target instanceof Element) {
        // Element scroll (modal, container, etc.)
        selector = generateSelector(target)
        scrollX = target.scrollLeft
        scrollY = target.scrollTop
      } else {
        return
      }

      const action: Omit<MacroAction, 'id' | 'timestamp'> = {
        type: 'scroll',
        selector,
        scrollDelta: {
          deltaX: scrollX,
          deltaY: scrollY,
        },
      }

      this.sendAction(action)
    }, 150)
  }

  private handleChange(e: Event) {
    const target = e.target as HTMLSelectElement
    if (!target || target.tagName !== 'SELECT') return

    const action: Omit<MacroAction, 'id' | 'timestamp'> = {
      type: 'select',
      selector: generateSelector(target),
      xpath: this.config.generateXPath ? generateXPath(target) : undefined,
      value: target.value,
      elementInfo: getElementInfo(target),
    }

    this.sendAction(action)
  }

  private shouldIgnoreElement(element: Element): boolean {
    // Ignore elements from the extension itself
    if (element.closest('[data-browser-agent-extension]')) return true

    return false
  }
}
