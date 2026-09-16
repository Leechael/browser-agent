import { type PageOptions, openPage, waitForMatch, PageLoadedWithoutMatchError, DEFAULT_TIMEOUTS } from '../common'
import { extractTimeline } from './transform'
import { SessionExpiredError } from './readTweet'

export type UserTimelineTab = 'tweets' | 'replies' | 'media'

export type ReadUserTimelineOptions = {
  screen_name: string
  tab?: UserTimelineTab
} & Omit<PageOptions, 'url'>

// X renamed the profile timeline endpoints (UserTweets -> UserOriginalsTimeline,
// UserTweetsAndReplies -> UserRepliesTimeline, media grid -> UserVideoTimeline).
// Match both generations.
const TAB_CONFIG: Record<UserTimelineTab, { urlSuffix: string; xhrPattern: RegExp }> = {
  tweets: { urlSuffix: '', xhrPattern: /UserTweets(?!AndReplies)|UserOriginalsTimeline/ },
  replies: { urlSuffix: '/with_replies', xhrPattern: /UserTweetsAndReplies|UserRepliesTimeline/ },
  media: { urlSuffix: '/media', xhrPattern: /UserMedia|UserVideoTimeline/ },
}

const VALID_TABS = new Set<string>(Object.keys(TAB_CONFIG))

export async function readUserTimeline({ screen_name, tab = 'tweets', ...options }: ReadUserTimelineOptions): Promise<unknown[]> {
  if (!VALID_TABS.has(tab)) {
    throw new Error(`Invalid tab "${tab}". Must be one of: ${[...VALID_TABS].join(', ')}`)
  }
  const config = TAB_CONFIG[tab]
  const url = `https://x.com/${screen_name}${config.urlSuffix}`
  const xhrWaitTimeout = options.timeout?.xhrWait ?? DEFAULT_TIMEOUTS.xhrWait
  const { client, xhr$ } = await openPage({ ...options, url })
  try {
    const resp = await waitForMatch(xhr$, config.xhrPattern, xhrWaitTimeout).catch(async (err) => {
      if (err instanceof PageLoadedWithoutMatchError) {
        // Only a real login redirect means the session expired; anything
        // else (slow tab, renamed endpoint, rate limit) is rethrown as-is.
        const href = (await client.Runtime.evaluate({ expression: 'location.href', returnByValue: true }))?.result?.value || ''
        if (href.includes('/login') || href.includes('/i/flow/')) {
          throw new SessionExpiredError()
        }
      }
      throw err
    })
    const body = await resp.json()
    const result = body?.data?.user?.result
    const instructions = result?.timeline_v2?.timeline?.instructions
      || result?.timeline?.timeline?.instructions
    if (!instructions) return []
    return extractTimeline(instructions)
  } finally {
    await client.close()
  }
}
