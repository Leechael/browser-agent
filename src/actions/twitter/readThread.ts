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
    let firstResp
    try {
      firstResp = await waitForMatch(xhr$, 'TweetDetail', xhrWaitTimeout)
    } catch (err) {
      if (err instanceof PageLoadedWithoutMatchError) {
        throw new SessionExpiredError()
      }
      throw err
    }

    const firstBody = await firstResp.json()

    // 提取主推文
    const mainTweet = extractMainTweet(firstBody, tweet_id)
    if (!mainTweet) {
      throw new Error(`Main tweet not found: ${tweet_id}`)
    }

    // 共享状态
    const allReplies: any[] = []
    const seenIds = new Set<string>()
    let stopLoading = false

    // 处理单次 TweetDetail 响应，返回新增条数
    function processResponse(body: any): number {
      const { tweets } = extractRepliesFromResponse(body)
      let added = 0
      for (const tweet of tweets) {
        if (tweet?.id && !seenIds.has(tweet.id)) {
          seenIds.add(tweet.id)
          allReplies.push(tweet)
          added++
        }
      }
      return added
    }

    processResponse(firstBody)

    // 初始响应已满足阈值，直接返回
    if (allReplies.length >= maxTweets) {
      return {
        mainTweet,
        replies: allReplies.slice(0, maxTweets),
        totalCount: maxTweets + 1,
        hasMore: true,
      }
    }

    const { Page, Runtime } = client
    await Page.enable()
    await Runtime.enable()

    // Watcher loop: 持续订阅 TweetDetail 响应，积累数据直到达到阈值或无新数据
    async function watcherLoop(): Promise<'threshold' | 'timeout' | 'no-new-data'> {
      while (!stopLoading) {
        let resp
        try {
          // 等待下一个 TweetDetail 响应（由 action loop 触发加载后到来）
          resp = await waitForMatch(xhr$, 'TweetDetail', 5000)
        } catch {
          // 超时：action loop 未能触发新的请求，或等待时间超限
          return 'timeout'
        }

        let body: any
        try {
          body = await resp.json()
        } catch {
          // 解析失败，跳过本次继续等待
          continue
        }

        const added = processResponse(body)

        if (allReplies.length >= maxTweets) {
          return 'threshold'
        }

        if (added === 0) {
          // 已无新回复，加载完毕
          return 'no-new-data'
        }
      }
      return 'threshold'
    }

    // Action loop: 轮询触发加载——优先点击 "Show replies"，否则滚动到底部触发无限滚动
    async function actionLoop(): Promise<void> {
      while (!stopLoading) {
        // 给页面留出渲染时间后再触发下一次加载
        await new Promise<void>(resolve => setTimeout(resolve, 800))
        if (stopLoading) break

        try {
          await Runtime.evaluate({
            expression: `
              (function() {
                // 优先尝试点击 "Show replies" 按钮
                const spans = document.querySelectorAll('span');
                for (const span of spans) {
                  if (span.textContent === 'Show replies') {
                    span.click();
                    return 'show-replies';
                  }
                }
                // 未找到按钮，滚动到底部触发无限加载
                window.scrollTo(0, document.body.scrollHeight);
                return 'scrolled';
              })()
            `,
            returnByValue: true,
          })
        } catch {
          // 客户端已关闭，退出循环
          break
        }
      }
    }

    // 启动 action loop（后台持续触发加载）
    const actionPromise = actionLoop().catch(() => { /* 忽略客户端关闭等预期错误 */ })

    // 等待 watcher loop 得出结论
    const watcherResult = await watcherLoop()

    // 通知 action loop 停止，等待其最后一次迭代完成（最多 500ms）
    stopLoading = true
    await Promise.race([
      actionPromise,
      new Promise<void>(resolve => setTimeout(resolve, 500)),
    ])

    return {
      mainTweet,
      replies: allReplies,
      totalCount: allReplies.length,
      hasMore: watcherResult === 'threshold',
    }

  } finally {
    await client.close()
  }
}
