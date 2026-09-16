import { search, RateLimitError, type SearchOptions } from './search'
import { SessionExpiredError } from './readTweet'

export interface WatchEvent {
  type: 'rate_limited' | 'error' | 'poll'
  [key: string]: unknown
}

export interface WatchSearchOptions extends SearchOptions {
  /** Seconds between polls. Default 60, minimum 30 (SearchTimeline is rate limited to ~50 req / 15 min). */
  intervalSec?: number
  /** Maximum watch lifetime in ms. Default 60 minutes. */
  maxLifetimeMs?: number
  /** Abort the watch (e.g. SSE client disconnect). */
  signal?: AbortSignal
  /** Called with each batch of newly seen results (already deduplicated).
   *  A rejected callback is fatal: the consumer is gone, so the watch stops. */
  onResults: (results: any[], resultType: 'tweets' | 'users') => void | Promise<void>
  /** Called for non-result events (rate limit backoff, transient errors, poll ticks).
   *  A rejected callback is fatal for the same reason as onResults. */
  onEvent?: (event: WatchEvent) => void | Promise<void>
}

const DEFAULT_INTERVAL_SEC = 60
const MIN_INTERVAL_SEC = 30
const DEFAULT_MAX_LIFETIME_MS = 60 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 3

class WatchAbortedError extends Error {
  constructor() {
    super('watch aborted')
    this.name = 'WatchAbortedError'
  }
}

class WatchDeadlineError extends Error {
  constructor() {
    super('watch deadline exceeded')
    this.name = 'WatchDeadlineError'
  }
}

/** Sleep that resolves early when the abort signal fires. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

/** Rejects when the abort signal fires or the deadline passes, whichever first.
 *  Call cancel() once the race is over to release the losing timer/listener. */
function untilAbortedOrDeadline(signal: AbortSignal | undefined, deadline: number): { promise: Promise<never>, cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const cancel = () => {
    if (timer) clearTimeout(timer)
    if (signal && onAbort) signal.removeEventListener('abort', onAbort)
  }
  const promise = new Promise<never>((_, reject) => {
    const finish = (err: Error) => {
      cancel()
      reject(err)
    }
    onAbort = () => finish(new WatchAbortedError())
    timer = setTimeout(() => finish(new WatchDeadlineError()), Math.max(0, deadline - Date.now()))
    if (signal?.aborted) {
      finish(new WatchAbortedError())
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  return { promise, cancel }
}

function resultKey(item: any): string | null {
  return item?.id || item?.user_id || null
}

/**
 * Watch a search query (typically the Latest tab) and emit new results as
 * they appear.
 *
 * X does not expose a pollable refresh endpoint we can replay: replayed
 * SearchTimeline requests are rejected (404) unless the transaction id is
 * freshly minted by the page, and the in-page "new posts" pill is fed by the
 * live_pipeline push channel rather than a documentable API. So watching is
 * implemented as periodic re-search with deduplication.
 *
 * Lifecycle: abort and deadline interrupt both the inter-poll sleep and an
 * in-flight poll. A poll orphaned by an interruption keeps running in the
 * background and closes its own browser page when it settles (bounded by the
 * page timeouts), so no resource leaks past that point.
 */
export async function watchSearch(options: WatchSearchOptions): Promise<void> {
  const {
    intervalSec = DEFAULT_INTERVAL_SEC,
    maxLifetimeMs = DEFAULT_MAX_LIFETIME_MS,
    signal,
    onResults,
    onEvent,
    ...searchOptions
  } = options

  const interval = Math.max(MIN_INTERVAL_SEC, intervalSec) * 1000
  const deadline = Date.now() + maxLifetimeMs
  const seen = new Set<string>()
  let failures = 0

  while (!signal?.aborted && Date.now() < deadline) {
    let results: any[]
    let resultType: 'tweets' | 'users'

    const poll = search({ maxTweets: 20, ...searchOptions })
    // The poll may be orphaned by an abort/deadline racing ahead; never let
    // its late rejection crash the process.
    poll.catch(() => {})
    const abortRace = untilAbortedOrDeadline(signal, deadline)
    try {
      const outcome = await Promise.race([poll, abortRace.promise])
      results = outcome.results
      resultType = outcome.resultType
    } catch (err) {
      if (err instanceof WatchAbortedError || err instanceof WatchDeadlineError) break
      if (err instanceof RateLimitError) {
        failures = 0
        const waitMs = err.resetAt
          ? Math.max(interval, err.resetAt * 1000 - Date.now() + 1000)
          : 15 * 60 * 1000
        // Consumer callback errors are fatal and propagate out of the watch.
        await onEvent?.({ type: 'rate_limited', resetAt: err.resetAt, waitMs })
        await abortableSleep(Math.min(waitMs, Math.max(0, deadline - Date.now())), signal)
        continue
      }
      if (err instanceof SessionExpiredError) {
        throw err
      }
      failures++
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        // Terminal failure is signaled solely by the throw (the SSE layer
        // writes the final error event); do not also emit one here.
        throw err
      }
      await onEvent?.({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        consecutiveFailures: failures,
      })
      await abortableSleep(Math.min(interval * 2, Math.max(0, deadline - Date.now())), signal)
      continue
    } finally {
      // Release the losing timer/listener of this round's abort race.
      abortRace.cancel()
    }

    // Honor abort and deadline even when the poll outlived them.
    if (signal?.aborted || Date.now() >= deadline) break

    const fresh: any[] = []
    for (const item of results) {
      const key = resultKey(item)
      if (!key || seen.has(key)) continue
      seen.add(key)
      fresh.push(item)
    }
    // IDs are retained for the whole watch lifetime: evicting them would
    // re-emit results that re-enter X's result window. At ~1 poll/min and
    // ~20 ids/poll the set stays small for any sane maxLifetimeMs.

    failures = 0
    if (fresh.length > 0) {
      await onResults(fresh, resultType)
    }
    await onEvent?.({ type: 'poll', newCount: fresh.length, seenCount: seen.size })

    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await abortableSleep(Math.min(interval, remaining), signal)
  }
}
