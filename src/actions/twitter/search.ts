import { firstValueFrom } from 'rxjs'
import { type PageOptions, openPage, matchedUrl } from '../common'
import { extractTimeline } from './transform'

export interface SearchOptions extends Omit<PageOptions, 'url'> {
  query: string

  // Advanced search parameters
  from?: string
  to?: string
  since?: string        // YYYY-MM-DD
  until?: string        // YYYY-MM-DD
  filter?: 'media' | 'images' | 'videos' | 'links' | 'replies' | 'native_video'
  minRetweets?: number
  minFaves?: number
  minReplies?: number
  lang?: string

  // Search result type
  searchType?: 'top' | 'latest' | 'people' | 'photos' | 'videos'
}

/**
 * Build a Twitter advanced search query string
 */
export function buildSearchQuery(options: SearchOptions): string {
  const parts: string[] = []

  // Base query
  if (options.query) {
    parts.push(options.query)
  }

  // From user
  if (options.from) {
    parts.push(`from:${options.from}`)
  }

  // To user
  if (options.to) {
    parts.push(`to:${options.to}`)
  }

  // Date range
  if (options.since) {
    parts.push(`since:${options.since}`)
  }
  if (options.until) {
    parts.push(`until:${options.until}`)
  }

  // Filter
  if (options.filter) {
    parts.push(`filter:${options.filter}`)
  }

  // Minimum engagement
  if (options.minRetweets !== undefined) {
    parts.push(`min_retweets:${options.minRetweets}`)
  }
  if (options.minFaves !== undefined) {
    parts.push(`min_faves:${options.minFaves}`)
  }
  if (options.minReplies !== undefined) {
    parts.push(`min_replies:${options.minReplies}`)
  }

  // Language
  if (options.lang) {
    parts.push(`lang:${options.lang}`)
  }

  return parts.join(' ')
}

/**
 * Get the URL parameter for search type
 */
function getSearchTypeParam(searchType?: SearchOptions['searchType']): string {
  switch (searchType) {
    case 'latest':
      return 'live'
    case 'people':
      return 'user'
    case 'photos':
      return 'image'
    case 'videos':
      return 'video'
    case 'top':
    default:
      return ''
  }
}

/**
 * Search tweets on Twitter/X
 */
export async function search(options: SearchOptions): Promise<unknown[]> {
  const { query, searchType, ...pageOptions } = options

  // Build the full query
  const fullQuery = buildSearchQuery(options)
  const encodedQuery = encodeURIComponent(fullQuery)

  // Build URL
  let url = `https://x.com/search?q=${encodedQuery}&src=typed_query`

  const typeParam = getSearchTypeParam(searchType)
  if (typeParam) {
    url += `&f=${typeParam}`
  }

  console.log(`[Search] URL: ${url}`)
  console.log(`[Search] Query: ${fullQuery}`)

  const { client, xhr$ } = await openPage({ ...pageOptions, url })

  try {
    const resp = await firstValueFrom(xhr$.pipe(matchedUrl('SearchTimeline')))
    const body = await resp.json()

    // Extract tweets from search response
    // Path: data.search_by_raw_query.search_timeline.timeline.instructions
    const instructions = body?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions

    if (!instructions) {
      console.log('[Search] No instructions found in response')
      return []
    }

    const tweets = extractTimeline(instructions)
    console.log(`[Search] Found ${tweets.length} tweets`)

    return tweets
  } finally {
    await client.close()
  }
}
