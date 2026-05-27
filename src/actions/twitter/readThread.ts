import { type PageOptions, openPage, DEFAULT_TIMEOUTS, type ObservableXHR, type XhrResponse } from '../common'
import { extractTweet } from './transform'
import { SessionExpiredError } from './readTweet'

export type ReadThreadOptions = {
  screen_name: string
  tweet_id: string
  maxTweets?: number  // 默认 100
  cursor?: string
  page?: boolean
} & Omit<PageOptions, 'url'>

export interface ThreadResult {
  mainTweet: any
  replies: any[]
  totalCount: number
  hasMore: boolean
  nextCursor?: string | null
}

interface ParsedTweets {
  tweets: any[]
  bottomCursor: string | null
}

function safeExtractTweet(tweetResult: any): any | null {
  try {
    return tweetResult ? extractTweet(tweetResult) : null
  } catch {
    return null
  }
}

function collectTweetResultsFromBody(body: any): any[] {
  const instructions = body?.data?.threaded_conversation_with_injections_v2?.instructions || []
  const tweetResults: any[] = []

  for (const instruction of instructions) {
    if (instruction.type === 'TimelineAddToModule') {
      for (const moduleItem of instruction.moduleItems || []) {
        const tweetResult = moduleItem.item?.itemContent?.tweet_results?.result
        if (tweetResult) tweetResults.push(tweetResult)
      }
      continue
    }

    if (instruction.type !== 'TimelineAddEntries') continue

    for (const entry of instruction.entries || []) {
      const itemTweetResult = entry.content?.itemContent?.tweet_results?.result
      if (itemTweetResult) tweetResults.push(itemTweetResult)

      for (const item of entry.content?.items || []) {
        const tweetResult = item.item?.itemContent?.tweet_results?.result
        if (tweetResult) tweetResults.push(tweetResult)
      }
    }
  }

  return tweetResults
}

function extractBottomCursor(body: any): string | null {
  const instructions = body?.data?.threaded_conversation_with_injections_v2?.instructions || []

  for (const instruction of instructions) {
    if (instruction.type !== 'TimelineAddEntries') continue

    for (const entry of instruction.entries || []) {
      if (entry.content?.cursorType === 'Bottom' && entry.content?.value) {
        return entry.content.value
      }
    }
  }

  return null
}

function extractTweetsFromResponse(body: any, mainTweetId: string): ParsedTweets {
  const tweets = collectTweetResultsFromBody(body)
    .map(safeExtractTweet)
    .filter((tweet): tweet is any => !!tweet && tweet.id !== mainTweetId)

  return {
    tweets,
    bottomCursor: extractBottomCursor(body),
  }
}

function extractMainTweet(body: any, tweetId: string): any | null {
  for (const tweetResult of collectTweetResultsFromBody(body)) {
    const tweet = safeExtractTweet(tweetResult)
    if (tweet?.id === tweetId) return tweet
  }

  return null
}

function waitForTweetDetail(xhr$: ObservableXHR, timeoutMs: number): Promise<XhrResponse | null> {
  return new Promise(resolve => {
    let resolved = false
    const timeoutHandle = setTimeout(() => {
      if (resolved) return
      resolved = true
      subscription.unsubscribe()
      resolve(null)
    }, timeoutMs)

    const subscription = xhr$.subscribe({
      next(value) {
        if (resolved) return
        if (!value || typeof (value as XhrResponse).url !== 'string') return

        const xhrResponse = value as XhrResponse
        if (xhrResponse.url.includes('TweetDetail')) {
          resolved = true
          clearTimeout(timeoutHandle)
          subscription.unsubscribe()
          resolve(xhrResponse)
        }
      },
      error() {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutHandle)
        resolve(null)
      },
    })
  })
}

function buildCursorUrl(templateUrl: string, cursor: string): string {
  const url = new URL(templateUrl)
  const variables = JSON.parse(url.searchParams.get('variables') || '{}')
  variables.cursor = cursor
  url.searchParams.set('variables', JSON.stringify(variables))
  return url.toString()
}

async function fetchTweetDetailPage(
  Runtime: any,
  templateUrl: string,
  cursor: string,
  requestHeaders: Record<string, string> = {}
): Promise<any | null> {
  const pageUrl = buildCursorUrl(templateUrl, cursor)
  const authorization = requestHeaders.authorization || requestHeaders.Authorization
  if (!authorization) return null

  const result = await Runtime.evaluate({
    expression: `
      (async function() {
        const ct0 = document.cookie.split('; ').find(item => item.startsWith('ct0='))?.slice(4);
        if (!ct0) return { ok: false, status: 0, text: '' };

        const response = await fetch(${JSON.stringify(pageUrl)}, {
          credentials: 'include',
          headers: {
            authorization: ${JSON.stringify(authorization)},
            'x-csrf-token': ct0,
            'x-twitter-active-user': ${JSON.stringify(requestHeaders['x-twitter-active-user'] || 'yes')},
            'x-twitter-auth-type': ${JSON.stringify(requestHeaders['x-twitter-auth-type'] || 'OAuth2Session')},
            'x-twitter-client-language': ${JSON.stringify(requestHeaders['x-twitter-client-language'] || 'en')},
            'content-type': 'application/json'
          }
        });

        return { ok: response.ok, status: response.status, text: await response.text() };
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
  })

  const value = result.result.value
  if (!value?.ok) return null

  try {
    return JSON.parse(value.text)
  } catch {
    return null
  }
}

export async function readThread({
  screen_name,
  tweet_id,
  maxTweets = 100,
  cursor,
  page = false,
  ...options
}: ReadThreadOptions): Promise<ThreadResult> {
  const xhrWaitTimeout = options.timeout?.xhrWait ?? DEFAULT_TIMEOUTS.xhrWait
  const url = `https://x.com/${screen_name}/status/${tweet_id}?browser_agent=${Date.now()}`

  const { client, xhr$ } = await openPage({ ...(options || {}), url })

  try {
    const firstResp = await waitForTweetDetail(xhr$, xhrWaitTimeout)
    if (!firstResp) throw new SessionExpiredError()

    const firstBody = await firstResp.json()
    const mainTweet = extractMainTweet(firstBody, tweet_id)
    if (!mainTweet) throw new Error(`Main tweet not found: ${tweet_id}`)

    const allReplies: any[] = []
    const seenIds = new Set<string>()
    let bottomCursor: string | null = null

    function processResponse(body: any): number {
      const parsed = extractTweetsFromResponse(body, tweet_id)
      bottomCursor = parsed.bottomCursor

      let added = 0
      for (const tweet of parsed.tweets) {
        if (tweet.id && !seenIds.has(tweet.id)) {
          seenIds.add(tweet.id)
          allReplies.push(tweet)
          added++
        }
      }
      return added
    }

    processResponse(firstBody)

    const requestHeaders = firstResp.requestHeaders || {}

    if (cursor) {
      allReplies.length = 0
      seenIds.clear()

      const body = await fetchTweetDetailPage(client.Runtime, firstResp.url, cursor, requestHeaders)
      if (!body) {
        return {
          mainTweet,
          replies: [],
          totalCount: 0,
          hasMore: false,
          nextCursor: null,
        }
      }

      processResponse(body)
      const capped = allReplies.slice(0, maxTweets)
      return {
        mainTweet,
        replies: capped,
        totalCount: allReplies.length,
        hasMore: !!bottomCursor,
        nextCursor: bottomCursor,
      }
    }

    if (page) {
      const capped = allReplies.slice(0, maxTweets)
      return {
        mainTweet,
        replies: capped,
        totalCount: allReplies.length,
        hasMore: !!bottomCursor,
        nextCursor: bottomCursor,
      }
    }

    let noProgressRounds = 0

    while (bottomCursor && allReplies.length < maxTweets && noProgressRounds < 3) {
      const body = await fetchTweetDetailPage(client.Runtime, firstResp.url, bottomCursor, requestHeaders)
      if (!body) break

      const previousCursor = bottomCursor
      const added = processResponse(body)

      if (added === 0 || bottomCursor === previousCursor) {
        noProgressRounds++
      } else {
        noProgressRounds = 0
      }
    }

    const capped = allReplies.slice(0, maxTweets)
    return {
      mainTweet,
      replies: capped,
      totalCount: allReplies.length,
      hasMore: allReplies.length >= maxTweets && !!bottomCursor,
      nextCursor: bottomCursor,
    }
  } finally {
    await client.close()
  }
}
