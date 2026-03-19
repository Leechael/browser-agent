import fs from 'fs'
import { createRequire } from 'module'
import { openPage } from '@/actions/common/openPage'

const require = createRequire(import.meta.url)

export interface FetchPageOptions {
  url: string
  inPage?: boolean
}

export interface FetchPageResult {
  url: string
  source: 'content-negotiation' | 'defuddle'
  title?: string
  author?: string
  description?: string
  domain?: string
  published?: string
  content: string
  wordCount?: number
}

/**
 * Try content negotiation first (Accept: text/markdown).
 * If the server doesn't return markdown, fall back to CDP + defuddle.
 */
export async function fetchPage({ url, inPage = false }: FetchPageOptions): Promise<FetchPageResult> {
  // Step 1: Try content negotiation
  const markdownResult = await tryContentNegotiation(url)
  if (markdownResult) {
    return markdownResult
  }

  // Step 2: Fall back to CDP + defuddle
  return await fetchWithDefuddle(url, inPage)
}

async function tryContentNegotiation(url: string): Promise<FetchPageResult | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/markdown, text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; BrowserAgent/1.0)',
      },
      redirect: 'follow',
    })

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/markdown')) {
      const content = await response.text()
      return {
        url,
        source: 'content-negotiation',
        content,
      }
    }

    return null
  } catch {
    return null
  }
}

async function fetchWithDefuddle(url: string, inPage: boolean): Promise<FetchPageResult> {
  const { client } = await openPage({ url })
  const { Runtime } = client

  try {
    await Runtime.enable()

    if (inPage) {
      return await extractInPage(client, url)
    } else {
      return await extractInNode(client, url)
    }
  } finally {
    await client.close()
  }
}

async function extractInPage(client: any, url: string): Promise<FetchPageResult> {
  const { Runtime } = client

  // Load the defuddle UMD bundle (exposes global `Defuddle`)
  const bundlePath = require.resolve('defuddle/full').replace(/index\.full\.js$/, 'index.full.js')
  const bundleCode = fs.readFileSync(bundlePath, 'utf-8')

  // Inject defuddle into the page
  await Runtime.evaluate({ expression: bundleCode })

  // Run defuddle in page context with markdown option
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        try {
          var result = new Defuddle(document, { markdown: true }).parse();
          return JSON.stringify({
            title: result.title,
            author: result.author,
            description: result.description,
            domain: result.domain,
            published: result.published,
            content: result.content,
            wordCount: result.wordCount,
          });
        } catch (e) {
          return JSON.stringify({ error: e.message });
        }
      })()
    `,
    returnByValue: true,
  })

  const parsed = JSON.parse(result.value)
  if (parsed.error) {
    throw new Error(`Defuddle in-page extraction failed: ${parsed.error}`)
  }

  return {
    url,
    source: 'defuddle',
    ...parsed,
  }
}

async function extractInNode(client: any, url: string): Promise<FetchPageResult> {
  const { Runtime } = client

  // Get the full HTML from the rendered page
  const { result } = await Runtime.evaluate({
    expression: 'document.documentElement.outerHTML',
    returnByValue: true,
  })

  const html = result.value as string

  const { Defuddle } = await import('defuddle/node')
  const parsed = await Defuddle(html, url, { markdown: true })

  return {
    url,
    source: 'defuddle',
    title: parsed.title,
    author: parsed.author,
    description: parsed.description,
    domain: parsed.domain,
    published: parsed.published,
    content: parsed.content,
    wordCount: parsed.wordCount,
  }
}
