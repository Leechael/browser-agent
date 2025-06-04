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
    if (tweet.article?.article_results?.result?.content_state?.blocks) {
      ret.article = tweet.article?.article_results?.result?.content_state?.blocks
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
        // Threads?
        else if (
          entry.content && entry.content.entryType === 'TimelineTimelineModule'
          && entry.content?.metadata?.conversationMetadata
        ) {
          // TODO: entry.content.displayType === 'VerticalConversation'
          const mainTweet: any = extractTweet(entry.content.items[0].item.itemContent)
          mainTweet.conversationAllTweetIds = entry.content.metadata.conversationMetadata.allTweetIds
          mainTweet.conversations = entry.content.items.slice(1).map((i: any) => {
            return extractTweet(i.item.itemContent)
          })
          tweets.push(mainTweet)
        } else {
          console.log(`unhandled entryType ${entry?.content?.entryType}`, entry)
        }
      });
    }
  });
  return tweets
}
