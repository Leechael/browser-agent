/**
 * Base class for all timeout errors in the browser agent.
 * Allows easy identification of timeout-related errors.
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
    public readonly phase: string
  ) {
    super(`${message} (timeout: ${timeoutMs}ms, phase: ${phase})`)
    this.name = 'TimeoutError'
  }
}

/**
 * CDP connection timeout - failed to connect to Chrome DevTools Protocol
 */
export class CDPConnectionTimeoutError extends TimeoutError {
  constructor(timeoutMs: number) {
    super('CDP connection timed out', timeoutMs, 'cdp_connection')
    this.name = 'CDPConnectionTimeoutError'
  }
}

/**
 * Page.enable timeout - CDP Page domain failed to enable
 */
export class PageEnableTimeoutError extends TimeoutError {
  constructor(timeoutMs: number) {
    super('Page.enable timed out', timeoutMs, 'page_enable')
    this.name = 'PageEnableTimeoutError'
  }
}

/**
 * Page navigation timeout - Page.navigate took too long
 */
export class PageNavigationTimeoutError extends TimeoutError {
  constructor(timeoutMs: number, public readonly url: string) {
    super(`Page navigation timed out for ${url}`, timeoutMs, 'page_navigation')
    this.name = 'PageNavigationTimeoutError'
  }
}

/**
 * Page load timeout - Page.loadEventFired took too long
 */
export class PageLoadTimeoutError extends TimeoutError {
  constructor(timeoutMs: number, public readonly url: string) {
    super(`Page load timed out for ${url}`, timeoutMs, 'page_load')
    this.name = 'PageLoadTimeoutError'
  }
}

/**
 * XHR wait timeout - waitForMatch exceeded time limit
 */
export class XhrWaitTimeoutError extends TimeoutError {
  constructor(timeoutMs: number, public readonly pattern: string | RegExp) {
    super(`XHR wait timed out for pattern: ${pattern}`, timeoutMs, 'xhr_wait')
    this.name = 'XhrWaitTimeoutError'
  }
}

/**
 * Page loaded but no matching XHR was found (page became idle)
 */
export class PageLoadedWithoutMatchError extends Error {
  constructor(public readonly pattern: string | RegExp) {
    super(`Page loaded but no XHR matched pattern: ${pattern}`)
    this.name = 'PageLoadedWithoutMatchError'
  }
}

/**
 * Timeout configuration for various phases of page operations
 */
export interface TimeoutConfig {
  /** CDP connection timeout in ms (default: 5000) */
  cdpConnection?: number;
  /** Page.enable timeout in ms (default: 100) */
  pageEnable?: number;
  /** Page.navigate timeout in ms (default: 30000) */
  pageNavigation?: number;
  /** Page.loadEventFired timeout in ms (default: 30000) */
  pageLoad?: number;
  /** waitForMatch timeout in ms (default: 30000) */
  xhrWait?: number;
  /** Idle detection time in ms - time without new XHR to consider page idle (default: 3000) */
  idleDetection?: number;
  /** Signal debounce time in ms (default: 1000) */
  signalDebounce?: number;
}

/**
 * Default timeout values
 */
export const DEFAULT_TIMEOUTS: Required<TimeoutConfig> = {
  cdpConnection: 5000,
  pageEnable: 100,
  pageNavigation: 30000,
  pageLoad: 30000,
  xhrWait: 30000,
  idleDetection: 3000,
  signalDebounce: 1000,
}

/**
 * Merge user-provided timeout config with defaults
 */
export function resolveTimeouts(config?: TimeoutConfig): Required<TimeoutConfig> {
  return {
    ...DEFAULT_TIMEOUTS,
    ...config,
  }
}
