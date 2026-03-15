export function extractMediaInfo(media: any[]) {
  if (!media) return null;
  return media.map(m => ({
      type: m.type,
      url: m.media_url_https,
      width: m.original_info.width,
      height: m.original_info.height
  }));
}


export function extractText(tweet: any) {
  const legacy = tweet.legacy
  if (tweet.note_tweet && tweet.note_tweet.note_tweet_results) {
    const noteTweet = tweet.note_tweet.note_tweet_results.result;
    // TODO: convert to markdown.
    return noteTweet.text;
  }

  let text = legacy.full_text;
  if (legacy.entities) {
    if (legacy.entities.media) {
      // Remove any embedding media links.
      (legacy.entities.media as any[]).forEach(media => {
          const mediaUrl = media.url;
          text = text.replace(mediaUrl, '').trim();
      });
    }

    if (legacy.entities.urls) {
      (legacy.entities.urls as any[]).forEach(rec => {
        text = text.replace(rec.url, rec.expanded_url)
      })
    }
  }
  return text;
}

function resolveArticleEntities(articleResult: any) {
  const blocks: any[] = articleResult.content_state?.blocks || []
  const rawEntityMap: any[] = articleResult.content_state?.entityMap || []
  const mediaEntities: any[] = articleResult.media_entities || []

  // Build media lookup: mediaId -> resolved info
  const mediaLookup: Record<string, any> = {}
  for (const me of mediaEntities) {
    if (me.media_info?.__typename === 'ApiImage') {
      mediaLookup[me.media_id] = {
        type: 'image',
        url: me.media_info.original_img_url,
        width: me.media_info.original_img_width,
        height: me.media_info.original_img_height,
      }
    } else if (me.media_info?.__typename === 'ApiVideo') {
      const best = (me.media_info.variants || [])
        .filter((v: any) => v.content_type === 'video/mp4')
        .sort((a: any, b: any) => (b.bit_rate || 0) - (a.bit_rate || 0))[0]
      mediaLookup[me.media_id] = {
        type: 'video',
        url: best?.url || me.media_info.preview_image?.original_img_url,
        preview: me.media_info.preview_image?.original_img_url,
      }
    }
  }

  // Build entityMap: key -> resolved entity
  const entityMap: Record<number, any> = {}
  for (const entry of rawEntityMap) {
    const v = entry.value
    if (v.type === 'MEDIA') {
      const items = (v.data.mediaItems || []).map((mi: any) => mediaLookup[mi.mediaId]).filter(Boolean)
      entityMap[entry.key] = { type: 'MEDIA', caption: v.data.caption, media: items }
    } else if (v.type === 'MARKDOWN') {
      entityMap[entry.key] = { type: 'MARKDOWN', markdown: v.data.markdown }
    } else if (v.type === 'TWEET') {
      entityMap[entry.key] = { type: 'TWEET', tweetId: v.data.tweetId }
    }
  }

  // Inline resolved entities into atomic blocks
  const resolvedBlocks = blocks.map(block => {
    if (block.type === 'atomic' && block.entityRanges?.length) {
      const entity = entityMap[block.entityRanges[0].key]
      if (entity) {
        return { ...block, entity }
      }
    }
    return block
  })

  return { resolvedBlocks, entityMap }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function applyInlineStyles(text: string, styles: any[]): string {
  if (!styles || !styles.length) return text
  const chars = [...text]
  // Track which styles apply to each character position
  const marks: Set<string>[] = chars.map(() => new Set())
  for (const s of styles) {
    for (let i = s.offset; i < s.offset + s.length && i < chars.length; i++) {
      marks[i].add(s.style)
    }
  }
  // Build output by grouping consecutive characters with same style set
  const result: string[] = []
  let i = 0
  while (i < chars.length) {
    const currentMarks = marks[i]
    // Collect run of chars with identical marks
    let j = i
    while (j < chars.length && setsEqual(marks[j], currentMarks)) j++
    const segment = chars.slice(i, j).join('')
    let wrapped = segment
    if (currentMarks.has('Bold')) wrapped = `**${wrapped}**`
    if (currentMarks.has('Italic')) wrapped = `*${wrapped}*`
    if (currentMarks.has('Strikethrough')) wrapped = `~~${wrapped}~~`
    result.push(wrapped)
    i = j
  }
  return result.join('')
}

function articleBlocksToMarkdown(blocks: any[]): string {
  let olCounter = 0
  const lines: string[] = []

  for (const block of blocks) {
    if (block.type === 'atomic' && block.entity) {
      const entity = block.entity
      if (entity.type === 'MEDIA') {
        for (const m of entity.media) {
          if (m.type === 'image') {
            lines.push(`![${entity.caption || ''}](${m.url})`)
          } else if (m.type === 'video') {
            lines.push(`[${entity.caption || 'video'}](${m.url})`)
          }
        }
      } else if (entity.type === 'MARKDOWN') {
        lines.push(entity.markdown)
      } else if (entity.type === 'TWEET') {
        lines.push(`https://x.com/i/status/${entity.tweetId}`)
      }
      olCounter = 0
      continue
    }

    const styledText = applyInlineStyles(block.text, block.inlineStyleRanges)

    switch (block.type) {
      case 'header-one':
        lines.push(`# ${styledText}`)
        olCounter = 0
        break
      case 'header-two':
        lines.push(`## ${styledText}`)
        olCounter = 0
        break
      case 'header-three':
        lines.push(`### ${styledText}`)
        olCounter = 0
        break
      case 'unordered-list-item':
        lines.push(`- ${styledText}`)
        olCounter = 0
        break
      case 'ordered-list-item':
        olCounter++
        lines.push(`${olCounter}. ${styledText}`)
        break
      case 'blockquote':
        lines.push(`> ${styledText}`)
        olCounter = 0
        break
      case 'code-block':
        lines.push('```')
        lines.push(block.text)
        lines.push('```')
        olCounter = 0
        break
      default:
        lines.push(styledText)
        olCounter = 0
        break
    }
  }

  return lines.join('\n')
}

export function extractTweet(tweet: any) {
  if (tweet.__typename === 'TimelineTweet') {
    tweet = tweet.tweet_results.result
  } else if (tweet.__typename === 'TweetWithVisibilityResults') {
    tweet = tweet.tweet
  }
  // const tweet = tweetData.tweet_results ? tweetData.tweet_results.result : tweetData
  // NOTE: 2025-06-04: `legacy` means it will be removed any time.
  const user = tweet.core.user_results.result
  const legacy = tweet.legacy

  const author = {
    user_id: user.rest_id,
    username: user.core.screen_name,
    name: user.core.name
  }
  const is_retweeted = !!legacy.retweeted_status_result
  const is_quoted = !!tweet.quoted_status_result || !!(tweet?.legacy?.is_quote_status)
  const is_article = !!tweet.article

  const ret: any = {
    id: tweet.rest_id,
    // text: is_retweeted ? extractText(legacy.retweeted_status_result.result) : extractText(tweet),
    text: extractText(tweet),
    created_at: legacy.created_at,
    author,
    is_retweeted,
    is_quoted,
    is_article,
    like_count: legacy.favorite_count,
    view_count: tweet.views ? tweet.views.count : 'N/A',
    retweet_count: legacy.retweet_count,
    quote_count: legacy.quote_count,
    reply_count: legacy.reply_count,
    bookmark_count: legacy.bookmark_count,
    media: extractMediaInfo(legacy.extended_entities?.media),
    user_mentions: legacy.entities?.user_mentions || [],
  };

  if (legacy.in_reply_to_status_id_str) {
    ret.in_reply_to_status_id = legacy.in_reply_to_status_id_str
  }
  if (legacy.conversation_id_str) {
    ret.conversation_id = legacy.conversation_id_str
  }

  if (is_retweeted) {
    ret.retweet_for = extractTweet(legacy.retweeted_status_result.result)
  }

  if (is_quoted && tweet?.quoted_status_result) {
    ret.quote_for = extractTweet(tweet.quoted_status_result.result)
  }

  if (is_article) {
    ret.article_url = `https://x.com/${ret.author.username}/article/${ret.id}`
    const articleResult = tweet.article?.article_results?.result
    if (articleResult?.content_state?.blocks) {
      const { resolvedBlocks } = resolveArticleEntities(articleResult)
      ret.article = resolvedBlocks
      ret.article_markdown = articleBlocksToMarkdown(resolvedBlocks)

      if (articleResult.cover_media?.media_info?.original_img_url) {
        ret.article_cover = articleResult.cover_media.media_info.original_img_url
      }
      if (articleResult.title) {
        ret.article_title = articleResult.title
      }
    }
  }

  return ret
}

export function extractTimeline(raw: any[]) {
  const tweets: any[] = []
  raw.forEach(instruction => {
    if (instruction.type === "TimelineAddEntries") {
      let i = 0
      instruction.entries.forEach((entry: any) => {
        console.log(`parsing index ${i++}`)
        let tweetContent;
        // Single tweets
        if (entry.content && entry.content.entryType === "TimelineTimelineItem") {
          // skip the promototed tweets
          if (entry?.content?.clientEventInfo?.component === 'following_promoted') {
            return
          }
          tweetContent = entry.content.itemContent
          const processedTweet = extractTweet(tweetContent)
          tweets.push(processedTweet)
        }
        // Threads (VerticalConversation)
        else if (
          entry.content && entry.content.entryType === 'TimelineTimelineModule'
          && entry.content?.metadata?.conversationMetadata
        ) {
          const mainTweet: any = extractTweet(entry.content.items[0].item.itemContent)
          mainTweet.conversationAllTweetIds = entry.content.metadata.conversationMetadata.allTweetIds
          mainTweet.conversations = entry.content.items.slice(1).map((i: any) => {
            return extractTweet(i.item.itemContent)
          })
          tweets.push(mainTweet)
        }
        // Grid / module items (media tab, etc.)
        else if (
          entry.content && entry.content.entryType === 'TimelineTimelineModule'
          && entry.content.items?.length
        ) {
          for (const item of entry.content.items) {
            const itemContent = item?.item?.itemContent
            if (itemContent) {
              tweets.push(extractTweet(itemContent))
            }
          }
        } else {
          console.log(`unhandled entryType ${entry?.content?.entryType}`, entry)
        }
      });
    }
  });
  return tweets
}
