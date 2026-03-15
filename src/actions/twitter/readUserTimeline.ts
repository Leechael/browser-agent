import { firstValueFrom } from 'rxjs'
import { type PageOptions, openPage, matchedUrl } from '../common'
import { extractTimeline } from './transform'

export type UserTimelineTab = 'tweets' | 'replies' | 'media'

export type ReadUserTimelineOptions = {
  screen_name: string
  tab?: UserTimelineTab
} & Omit<PageOptions, 'url'>

const TAB_CONFIG: Record<UserTimelineTab, { urlSuffix: string; xhrPattern: string }> = {
  tweets: { urlSuffix: '', xhrPattern: 'UserTweets' },
  replies: { urlSuffix: '/with_replies', xhrPattern: 'UserTweetsAndReplies' },
  media: { urlSuffix: '/media', xhrPattern: 'UserMedia' },
}

const VALID_TABS = new Set<string>(Object.keys(TAB_CONFIG))

export async function readUserTimeline({ screen_name, tab = 'tweets', ...options }: ReadUserTimelineOptions): Promise<unknown[]> {
  if (!VALID_TABS.has(tab)) {
    throw new Error(`Invalid tab "${tab}". Must be one of: ${[...VALID_TABS].join(', ')}`)
  }
  const config = TAB_CONFIG[tab]
  const url = `https://x.com/${screen_name}${config.urlSuffix}`
  const { client, xhr$ } = await openPage({ ...options, url })
  try {
    const resp = await firstValueFrom(xhr$.pipe(matchedUrl(config.xhrPattern)))
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
