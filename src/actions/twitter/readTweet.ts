// TODO ensure selected the 'Following' tab.
import { type PageOptions, openPage, waitForMatch, PageLoadedWithoutMatchError } from '../common'
import { extractTweet } from './transform'

export class SessionExpiredError extends Error {
  constructor(message = 'Twitter session expired, please re-login') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

export type ReadTweetOptions = {
  screen_name: string
  tweet_id: string
} & Omit<PageOptions, 'url'>

export async function readTweet({ screen_name, tweet_id, ...options }: ReadTweetOptions) {
  const { client, xhr$ } = await openPage({ ...(options || {}), url: `https://x.com/${screen_name}/status/${tweet_id}` })
  try {
    let resp
    try {
      resp = await waitForMatch(xhr$, 'TweetDetail', 30000)
    } catch (err) {
      if (err instanceof PageLoadedWithoutMatchError) {
        throw new SessionExpiredError()
      }
      throw err
    }
    const body = await resp.json()
    const instructions = (body?.data?.threaded_conversation_with_injections_v2?.instructions || []).filter((i: any) => i.type === 'TimelineAddEntries')
    const entries = (instructions[0] || { entries: [] }).entries || []
    const tweetEntries = entries.filter((i: any) => i.entryId.startsWith('tweet-'))
    if (tweetEntries.length) {
      let tweet
      // For must of case, the target tweet should be the first matched item, unless in conversation mode, which is a reply to the original tweet.
      // To adjusting this scenario, let's try matched by full entryId first.
      const probablyReply = tweetEntries.find((i: any) => i?.entryId === `tweet-${tweet_id}`)
      if (probablyReply) {
        tweet = extractTweet(probablyReply?.content?.itemContent?.tweet_results?.result)
        const threads = tweetEntries
          .filter((i: any) => i?.entryId !== `tweet-${tweet_id}`)
          .map((i: any) => extractTweet(i.content?.itemContent?.tweet_results?.result))
        const selfThread = entries.find((i: any) => i?.content?.displayType === 'VerticalConversation' && i?.content.items[0]?.item?.itemContent?.tweetDisplayType === 'SelfThread')
        const followUps = (selfThread?.content?.items || []).map((i: any) => extractTweet(i.item?.itemContent?.tweet_results?.result))
        tweet.threads = threads.concat(followUps)
      } else {
        tweet = extractTweet(tweetEntries[0]?.content?.itemContent?.tweet_results?.result)
        // Try find out self-thread
        const selfThread = entries.find((i: any) => i?.content?.displayType === 'VerticalConversation' && i?.content.items[0]?.item?.itemContent?.tweetDisplayType === 'SelfThread')
        const threads = (selfThread?.content?.items || []).map((i: any) => extractTweet(i.item?.itemContent?.tweet_results?.result))
        tweet.threads = threads
      }
      return tweet
    }
  } catch (err) {
    console.log('err', err)
  } finally {
    await client.close()
  }
}

