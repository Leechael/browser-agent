import { type PageOptions, openPage, waitForMatch, PageLoadedWithoutMatchError, DEFAULT_TIMEOUTS } from '../common'
import { extractTweet } from './transform'
import { SessionExpiredError } from './readTweet'

export type ReadThreadOptions = {
  screen_name: string
  tweet_id: string
  maxTweets?: number  // 默认 100
} & Omit<PageOptions, 'url'>

export interface ThreadResult {
  mainTweet: any
  replies: any[]
  totalCount: number
  hasMore: boolean
}

interface ParsedReplies {
  tweets: any[]
}

function extractRepliesFromResponse(body: any): ParsedReplies {
  const instructions = (body?.data?.threaded_conversation_with_injections_v2?.instructions || [])
    .filter((i: any) => i.type === 'TimelineAddEntries' || i.type === 'TimelineAddToModule')

  const tweets: any[] = []
  for (const instruction of instructions) {
    if (instruction.type === 'TimelineAddToModule') {
      const moduleItems = instruction.moduleItems
      for (const moduleItem of moduleItems) {
        const itemContent = moduleItem.item?.itemContent
        // 提取推文
        if (itemContent?.__typename === 'TimelineTweet') {
          const tweetResult = itemContent.tweet_results?.result
          if (tweetResult) {
            tweets.push(extractTweet(tweetResult))
          }
        }
      }
    } else if (instruction.type === 'TimelineAddEntries') {

      const entries = (instructions[0] || { entries: [] }).entries || (instructions[0] || { moduleItems: [] }).moduleItems || []

      for (const entry of entries) {
        const content = entry.content

        // 跳过主推文（已单独处理）和 cursor
        if (entry.entryId?.startsWith('tweet-')) {
          continue
        }

        // 处理回复模块 (TimelineTimelineModule)
        if (content?.__typename === 'TimelineTimelineModule' || content?.entryType === 'TimelineTimelineModule') {
          const items = content.items || []

          for (const item of items) {
            const itemContent = item.item?.itemContent

            // 提取推文
            if (itemContent?.__typename === 'TimelineTweet') {
              const tweetResult = itemContent.tweet_results?.result
              if (tweetResult) {
                tweets.push(extractTweet(tweetResult))
              }
            }
          }
        }
      }
    }
  }

  return { tweets }
}

function extractMainTweet(body: any, tweetId: string): any | null {
  const instructions = (body?.data?.threaded_conversation_with_injections_v2?.instructions || [])
    .filter((i: any) => i.type === 'TimelineAddEntries')

  const entries = (instructions[0] || { entries: [] }).entries || []

  for (const entry of entries) {
    if (entry.entryId === `tweet-${tweetId}`) {
      const tweetResult = entry.content?.itemContent?.tweet_results?.result
      if (tweetResult) {
        return extractTweet(tweetResult)
      }
    }
  }

  return null
}

export async function readThread({
  screen_name,
  tweet_id,
  maxTweets = 100,
  ...options
}: ReadThreadOptions): Promise<ThreadResult> {
  const xhrWaitTimeout = options.timeout?.xhrWait ?? DEFAULT_TIMEOUTS.xhrWait
  const url = `https://x.com/${screen_name}/status/${tweet_id}`

  const { client, xhr$ } = await openPage({ ...(options || {}), url })

  try {
    // 等待初始 TweetDetail 响应
    let resp
    try {
      resp = await waitForMatch(xhr$, 'TweetDetail', xhrWaitTimeout)
    } catch (err) {
      if (err instanceof PageLoadedWithoutMatchError) {
        throw new SessionExpiredError()
      }
      throw err
    }

    const body = await resp.json()

    // 提取主推文
    const mainTweet = extractMainTweet(body, tweet_id)
    if (!mainTweet) {
      throw new Error(`Main tweet not found: ${tweet_id}`)
    }

    // 提取初始回复
    let hasShowMore = true
    const allReplies: any[] = []
    const seenIds = new Set<string>()

    let { tweets: initialReplies } = extractRepliesFromResponse(body)

    // 去重并添加
    for (const reply of initialReplies) {
      if (!seenIds.has(reply.id)) {
        seenIds.add(reply.id)
        allReplies.push(reply)
      }
    }

    // 循环加载更多回复
    const { Page, Runtime } = client
    await Page.enable()
    await Runtime.enable()

    while (allReplies.length < maxTweets) {
      // 轮询等待 "Show replies" 按钮出现（异步渲染）
      const POLL_INTERVAL = 200
      const POLL_TIMEOUT = 2000
      const pollStart = Date.now()
      let buttonFound = false

      while (Date.now() - pollStart < POLL_TIMEOUT) {
        const { result } = await Runtime.evaluate({
          expression: `
            (function() {
              const spans = document.querySelectorAll('span');
              for (const span of spans) {
                if (span.textContent === 'Show replies') {
                  return true;
                }
              }
              return false;
            })()
          `,
          returnByValue: true
        })

        if (result.value) {
          buttonFound = true
          break
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
      }

      if (!buttonFound) {
        // 等待超时仍未找到 Show replies 按钮，停止
        hasShowMore = false
        break
      }

      // 等待新的 TweetDetail 响应
      try {
        const waitForNewTweetDetailPromise = waitForMatch(xhr$, 'TweetDetail', xhrWaitTimeout)
        // 点击 Show replies 按钮
        const clickShowMorePromise = Runtime.evaluate({
          expression: `
          (function() {
            const spans = document.querySelectorAll('span');
            for (const span of spans) {
              if (span.textContent === 'Show replies') {
                span.click();
                return true;
              }
            }
            return false;
          })()
        `,
          returnByValue: true
        })
        const [_, newResp] = await Promise.all([clickShowMorePromise, waitForNewTweetDetailPromise])
        const newBody = await newResp.json()

        const { tweets: newReplies } = extractRepliesFromResponse(newBody)

        // 去重并添加新回复
        let addedCount = 0
        for (const reply of newReplies) {
          if (!seenIds.has(reply.id)) {
            seenIds.add(reply.id)
            allReplies.push(reply)
            addedCount++
          }
        }

        // 如果没有新回复，停止循环防止无限循环
        if (addedCount === 0) {
          break
        }

      } catch (err) {
        // 加载更多失败时停止，但不抛出错误
        console.warn('Failed to load more replies:', err)
        hasShowMore = false
        break
      }
    }

    return {
      mainTweet,
      replies: allReplies,
      totalCount: allReplies.length + 1, // +1 for main tweet
      hasMore: hasShowMore
    }

  } finally {
    await client.close()
  }
}
