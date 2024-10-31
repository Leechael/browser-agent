// TODO ensure selected the 'Following' tab.
import { firstValueFrom } from 'rxjs'
import { type PageOptions, openPage, matchedUrl } from '../common'
import { extractTweet } from './transform'

export async function readMentions(options?: PageOptions) {
  const { client, xhr$ } = await openPage({ ...(options || {}), url: 'https://x.com/notifications/mentions' })
  const resp = await firstValueFrom(xhr$.pipe(matchedUrl('mentions.json')))
  const body = await resp.json()
  const { tweets = {}, users = {} } = body?.globalObjects || {}
  const instructions = body?.timeline?.instructions || []
  const result: any[] = []
  instructions.forEach((instruction: any) => {
    (instruction?.addEntries?.entries || []).forEach((entry: any) => {
      const tweet_id = entry?.content?.item?.content?.tweet?.id
      const legacy = tweets[tweet_id]
      const user = users[legacy?.user_id_str]
      if (legacy && user) {
        result.push(extractTweet({
          rest_id: tweet_id,
          legacy,
          core: {
            user_results: {
              result: {
                rest_id: legacy?.user_id_str,
                legacy: user,
              }
            }
          }
        }))
      }
    })
  })
  await client.close()
  return result
}

