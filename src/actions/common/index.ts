export {
  openPage,
  matchedUrl,
  waitForMatch,
  loadingFinishedSymbol,
  pageIdleSymbol,
  type PageOptions,
  type XhrResponse,
  type ObservableXHR,
  type StreamSignal,
} from './openPage'

export {
  // Error classes
  TimeoutError,
  CDPConnectionTimeoutError,
  PageEnableTimeoutError,
  PageNavigationTimeoutError,
  PageLoadTimeoutError,
  XhrWaitTimeoutError,
  PageLoadedWithoutMatchError,
  // Config
  type TimeoutConfig,
  DEFAULT_TIMEOUTS,
  resolveTimeouts,
} from './errors'

export { waitForElement } from './waitForElement'
export { clickElement } from './clickElement'
export { typeHumanLike } from './typeHumanLike'
export { getRandomDelay, HUMAN_DELAY } from './getRandomDelay'
