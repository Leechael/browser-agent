// TODO ensure selected the 'Following' tab.
import { firstValueFrom } from 'rxjs'
import { type PageOptions, openPage, matchedUrl } from '../common'
import { extractTimeline } from './transform'

export async function readHomeTimeline(options?: PageOptions): Promise<unknown[]> {
  const { client, xhr$ } = await openPage({ ...(options || {}), url: 'https://x.com/home' })
  const resp = await firstValueFrom(xhr$.pipe(matchedUrl('HomeLatestTimeline')))
  const body = await resp.json()
  const tweets = extractTimeline(body?.data?.home?.home_timeline_urt?.instructions)
  await client.close()
  return tweets
}

