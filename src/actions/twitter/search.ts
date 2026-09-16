import { type PageOptions, openPage, waitForMatch, PageLoadedWithoutMatchError, XhrWaitTimeoutError, DEFAULT_TIMEOUTS, type ObservableXHR, type XhrResponse } from '../common'
import { extractSearchTimeline } from './transform'
import { SessionExpiredError } from './readTweet'

export class RateLimitError extends Error {
  constructor(
    public readonly resetAt: number | null,
    message = 'Twitter rate limit exceeded'
  ) {
    super(message)
    this.name = 'RateLimitError'
  }
}

class SearchPageFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchPageFetchError'
  }
}

export interface SearchOptions extends Omit<PageOptions, 'url'> {
  query: string

  // Advanced search parameters
  from?: string
  to?: string
  since?: string        // YYYY-MM-DD
  until?: string        // YYYY-MM-DD
  filter?: 'media' | 'images' | 'videos' | 'links' | 'replies' | 'native_video'
  minRetweets?: number
  minFaves?: number
  minReplies?: number
  lang?: string

  // Search result type; 'photos'/'videos' are legacy aliases for the Media tab.
  searchType?: 'top' | 'latest' | 'people' | 'media' | 'photos' | 'videos'

  // Collect up to this many results by scrolling the result list (default 20).
  maxTweets?: number
}

export interface SearchResult {
  results: any[]
  resultType: 'tweets' | 'users'
  totalCount: number
  hasMore: boolean
}

/**
 * Build a Twitter advanced search query string
 */
export function buildSearchQuery(options: SearchOptions): string {
  const parts: string[] = []

  // Base query
  if (options.query) {
    parts.push(options.query)
  }

  // From user
  if (options.from) {
    parts.push(`from:${options.from}`)
  }

  // To user
  if (options.to) {
    parts.push(`to:${options.to}`)
  }

  // Date range
  if (options.since) {
    parts.push(`since:${options.since}`)
  }
  if (options.until) {
    parts.push(`until:${options.until}`)
  }

  // Filter
  if (options.filter) {
    parts.push(`filter:${options.filter}`)
  }

  // Minimum engagement
  if (options.minRetweets !== undefined) {
    parts.push(`min_retweets:${options.minRetweets}`)
  }
  if (options.minFaves !== undefined) {
    parts.push(`min_faves:${options.minFaves}`)
  }
  if (options.minReplies !== undefined) {
    parts.push(`min_replies:${options.minReplies}`)
  }

  // Language
  if (options.lang) {
    parts.push(`lang:${options.lang}`)
  }

  return parts.join(' ')
}

/**
 * Get the URL parameter for search type.
 * Current X tabs: Top / Latest / People / Media. The old `f=image` and
 * `f=video` params are ignored by X (fall back to Top), so they map to Media.
 */
function getSearchTypeParam(searchType?: SearchOptions['searchType']): string {
  switch (searchType) {
    case 'latest':
      return 'live'
    case 'people':
      return 'user'
    case 'media':
    case 'photos':
    case 'videos':
      return 'media'
    case 'top':
    default:
      return ''
  }
}

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === lower) return headers[key]
  }
  return undefined
}

function assertSearchResponseOk(resp: XhrResponse) {
  if (resp.status === 429) {
    const reset = getHeader(resp.headers, 'x-rate-limit-reset')
    throw new RateLimitError(reset ? Number(reset) : null)
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new SearchPageFetchError(`SearchTimeline request failed with status ${resp.status}`)
  }
}

function assertSearchBodyOk(body: any) {
  if (body?.errors && !body?.data) {
    const message = (body.errors as any[])
      .map(e => e?.message || `code ${e?.code}`)
      .join('; ')
    throw new SearchPageFetchError(`SearchTimeline returned errors: ${message}`)
  }
}

/**
 * Wait for the next SearchTimeline response on the XHR stream, ignoring idle
 * signals (the page stays alive between scroll rounds). Resolves to null on
 * timeout instead of throwing.
 */
function waitForNextSearchPage(xhr$: ObservableXHR, timeoutMs: number): Promise<XhrResponse | null> {
  return new Promise(resolve => {
    let settled = false
    const cleanup = () => {
      subscription.unsubscribe()
      clearTimeout(timeoutHandle)
    }
    const subscription = xhr$.subscribe({
      next(value) {
        if (settled) return
        const resp = value as XhrResponse
        if (!resp || typeof resp.url !== 'string') return
        if (resp.url.includes('SearchTimeline')) {
          settled = true
          cleanup()
          resolve(resp)
        }
      },
      error() {
        if (settled) return
        settled = true
        cleanup()
        resolve(null)
      },
    })
    const timeoutHandle = setTimeout(() => {
      if (settled) return
      settled = true
      subscription.unsubscribe()
      resolve(null)
    }, timeoutMs)
  })
}

async function scrollToBottom(Runtime: any) {
  await Runtime.evaluate({ expression: 'window.scrollTo(0, document.body.scrollHeight)' })
}

async function isLoginRedirect(Runtime: any): Promise<boolean> {
  const result = await Runtime.evaluate({ expression: 'location.href', returnByValue: true })
  const href = result?.result?.value || ''
  return href.includes('/login') || href.includes('/i/flow/')
}

/**
 * Search tweets on Twitter/X.
 *
 * Pagination is driven by scrolling the result list and capturing the
 * SearchTimeline requests the page itself issues. Replaying the API with a
 * cursor does not work: X rejects replayed SearchTimeline requests (404)
 * unless the x-client-transaction-id is freshly minted by the page.
 */
export async function search(options: SearchOptions): Promise<SearchResult> {
  const { query, searchType, maxTweets: rawMaxTweets = 20, ...pageOptions } = options
  // Clamp invalid values: negative numbers would make slice(0, n) misbehave.
  const maxTweets = Number.isFinite(rawMaxTweets) ? Math.max(1, Math.floor(rawMaxTweets)) : 20

  // Build the full query
  const fullQuery = buildSearchQuery(options)
  const encodedQuery = encodeURIComponent(fullQuery)

  // Build URL
  let url = `https://x.com/search?q=${encodedQuery}&src=typed_query`

  const typeParam = getSearchTypeParam(searchType)
  if (typeParam) {
    url += `&f=${typeParam}`
  }

  console.log(`[Search] URL: ${url}`)
  console.log(`[Search] Query: ${fullQuery}`)

  const xhrWaitTimeout = pageOptions.timeout?.xhrWait ?? DEFAULT_TIMEOUTS.xhrWait
  const { client, xhr$ } = await openPage({ ...pageOptions, url })

  try {
    // The first SearchTimeline request can lag behind page idle on slower
    // tabs (e.g. Media). Subscribe BEFORE nudging the page, otherwise a
    // response triggered by the nudge can fall into the gap between waits
    // (and the one-shot idle signal never fires again).
    let resp: XhrResponse | null = null
    let lastWaitErr: unknown = null
    for (let attempt = 0; attempt < 2 && !resp; attempt++) {
      // Check the redirect BEFORE creating the waiter: throwing here with an
      // active waitPromise would leak its subscription and its later
      // rejection. The waiter is created immediately before the nudge so no
      // triggered response can fall into a gap.
      if (attempt > 0 && await isLoginRedirect(client.Runtime)) {
        throw new SessionExpiredError()
      }
      const waitPromise = waitForMatch(xhr$, 'SearchTimeline', xhrWaitTimeout)
      if (attempt > 0) {
        await scrollToBottom(client.Runtime)
      }
      try {
        resp = await waitPromise
      } catch (err) {
        lastWaitErr = err
        if (err instanceof PageLoadedWithoutMatchError || err instanceof XhrWaitTimeoutError) {
          continue
        }
        throw err
      }
    }
    if (!resp) {
      if (lastWaitErr instanceof PageLoadedWithoutMatchError && await isLoginRedirect(client.Runtime)) {
        throw new SessionExpiredError()
      }
      throw new SearchPageFetchError('SearchTimeline did not load')
    }

    assertSearchResponseOk(resp)
    let firstBody: any
    try {
      firstBody = await resp.json()
    } catch {
      throw new SearchPageFetchError('SearchTimeline returned invalid JSON')
    }
    assertSearchBodyOk(firstBody)

    const allTweets: any[] = []
    const allUsers: any[] = []
    const seenIds = new Set<string>()
    let bottomCursor: string | null = null

    function processBody(body: any): { addedTweets: number, addedUsers: number } {
      const parsed = extractSearchTimeline(body)
      bottomCursor = parsed.bottomCursor

      let addedTweets = 0
      let addedUsers = 0
      for (const tweet of parsed.tweets) {
        const key = tweet?.id
        if (key && !seenIds.has(`t:${key}`)) {
          seenIds.add(`t:${key}`)
          allTweets.push(tweet)
          addedTweets++
        }
      }
      for (const user of parsed.users) {
        const key = user?.user_id
        if (key && !seenIds.has(`u:${key}`)) {
          seenIds.add(`u:${key}`)
          allUsers.push(user)
          addedUsers++
        }
      }
      return { addedTweets, addedUsers }
    }

    processBody(firstBody)

    // Result selection is driven by the requested tab, not by what happens
    // to be in the response: Top results can contain a "People" carousel
    // (TimelineUser cards) alongside tweets, and an empty People search must
    // still report resultType=users.
    const isPeopleSearch = searchType === 'people'
    const count = () => isPeopleSearch ? allUsers.length : allTweets.length

    let idleRounds = 0
    let rounds = 0
    // Hard backstop: never scroll forever even if every page looks "new".
    const maxRounds = Math.max(5, Math.ceil(maxTweets / 20) + 3)
    while (bottomCursor && count() < maxTweets && idleRounds < 2 && rounds < maxRounds) {
      rounds++
      const pagePromise = waitForNextSearchPage(xhr$, xhrWaitTimeout)
      await scrollToBottom(client.Runtime)
      const nextResp = await pagePromise

      if (!nextResp) {
        idleRounds++
        continue
      }

      try {
        assertSearchResponseOk(nextResp)
        let body: any
        try {
          body = await nextResp.json()
        } catch {
          // Undecodable page mid-pagination: keep what we have.
          console.log('[Search] pagination stopped early: invalid JSON page')
          break
        }
        assertSearchBodyOk(body)

        const previousCursor = bottomCursor
        const { addedTweets, addedUsers } = processBody(body)
        // Judge progress only by the active result type: a People carousel
        // adding users must not reset the tweet stall counter (and vice
        // versa). No progress = nothing added OR a non-advancing cursor.
        const addedRelevant = isPeopleSearch ? addedUsers : addedTweets
        const stalled = addedRelevant === 0 || bottomCursor === previousCursor
        idleRounds = stalled ? idleRounds + 1 : 0
      } catch (err) {
        // Rate limited or failed mid-pagination: keep what we have.
        if (count() > 0 && (err instanceof RateLimitError || err instanceof SearchPageFetchError)) {
          console.log(`[Search] pagination stopped early: ${err.message}`)
          break
        }
        throw err
      }
    }

    const resultType: SearchResult['resultType'] = isPeopleSearch ? 'users' : 'tweets'
    const collected = isPeopleSearch ? allUsers : allTweets
    const results = collected.slice(0, maxTweets)
    console.log(`[Search] Found ${results.length} ${resultType}`)
    return {
      results,
      resultType,
      totalCount: collected.length,
      hasMore: !!bottomCursor,
    }
  } finally {
    await client.close()
  }
}
