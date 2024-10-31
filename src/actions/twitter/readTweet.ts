// TODO ensure selected the 'Following' tab.
import { firstValueFrom } from 'rxjs'
import { type PageOptions, openPage, matchedUrl } from '../common'
import { extractTweet } from './transform'

export type ReadTweetOptions = {
  screen_name: string
  tweet_id: string
} & Omit<PageOptions, 'url'>

export async function readTweet({ screen_name, tweet_id, ...options }: ReadTweetOptions) {
  const { client, xhr$ } = await openPage({ ...(options || {}), url: `https://x.com/${screen_name}/status/${tweet_id}` })
  try {
  const resp = await firstValueFrom(xhr$.pipe(matchedUrl('TweetDetail')))
  const body = await resp.json()
  const matched1 = (body?.data?.threaded_conversation_with_injections_v2?.instructions || []).filter((i: any) => i.type === 'TimelineAddEntries')
  const matched2 = (matched1[0] || { entries: [] }).entries.filter((i: any) => i.entryId.startsWith('tweet-'))
  if (matched2.length) {
    return extractTweet(matched2[0]?.content?.itemContent?.tweet_results?.result)
  }
  } finally {
    await client.close()
  }
}
