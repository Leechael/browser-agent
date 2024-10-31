// TODO ensure selected the 'Following' tab.
import { firstValueFrom } from 'rxjs'
import { type PageOptions, openPage, matchedUrl } from '../common'
import { extractTimeline } from './transform'

export type ReadUserTimelineOptions = {
  screen_name: string
} & Omit<PageOptions, 'url'>

export async function readUserTimeline({ screen_name, ...options }: ReadUserTimelineOptions): Promise<unknown[]> {
  const { client, xhr$ } = await openPage({ ...(options || {}), url: `https://x.com/${screen_name}` })
  const resp = await firstValueFrom(xhr$.pipe(matchedUrl('UserTweets')))
  const body = await resp.json()
  const tweets = extractTimeline(body?.data?.user?.result?.timeline_v2?.timeline?.instructions)
  await client.close()
  return tweets
}

