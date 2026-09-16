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
  /** Called with each batch of newly seen results (already deduplicated). */
  onResults: (results: any[], resultType: 'tweets' | 'users') => void | Promise<void>
  /** Called for non-fatal events (rate limit backoff, transient errors, poll ticks). */
  onEvent?: (event: WatchEvent) => void | Promise<void>
}

const DEFAULT_INTERVAL_SEC = 60
const MIN_INTERVAL_SEC = 30
const DEFAULT_MAX_LIFETIME_MS = 60 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 3
const SEEN_IDS_CAP = 5000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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

  const emit = async (event: WatchEvent) => {
    try {
      await onEvent?.(event)
    } catch {
      // Consumer callbacks must not kill the watch loop.
    }
  }

  while (!signal?.aborted && Date.now() < deadline) {
    try {
      const { results, resultType } = await search({ ...searchOptions, maxTweets: 20 })

      const fresh: any[] = []
      for (const item of results) {
        const key = resultKey(item)
        if (!key || seen.has(key)) continue
        seen.add(key)
        fresh.push(item)
      }
      // Bound memory on long watches.
      if (seen.size > SEEN_IDS_CAP) {
        const drop = seen.size - SEEN_IDS_CAP
        let i = 0
        for (const key of seen) {
          seen.delete(key)
          if (++i >= drop) break
        }
      }

      failures = 0
      if (fresh.length > 0) {
        await onResults(fresh, resultType)
      }
      await emit({ type: 'poll', newCount: fresh.length, seenCount: seen.size })

      const remaining = deadline - Date.now()
      if (remaining <= 0) break
      await sleep(Math.min(interval, remaining))
    } catch (err) {
      if (err instanceof RateLimitError) {
        failures = 0
        const waitMs = err.resetAt
          ? Math.max(interval, err.resetAt * 1000 - Date.now() + 1000)
          : 15 * 60 * 1000
        await emit({ type: 'rate_limited', resetAt: err.resetAt, waitMs })
        await sleep(Math.min(waitMs, Math.max(0, deadline - Date.now())))
        continue
      }
      if (err instanceof SessionExpiredError) {
        throw err
      }
      failures++
      await emit({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        consecutiveFailures: failures,
      })
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        throw err
      }
      await sleep(Math.min(interval * 2, Math.max(0, deadline - Date.now())))
    }
  }
}
