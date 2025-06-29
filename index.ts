import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import { streamSSE } from 'hono/streaming';
import { SSETransport } from 'hono-mcp-server-sse-transport';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { openPage } from '@/actions/common/openPage'
import { waitForElement } from '@/actions/common/waitForElement'
import { readHomeTimeline, readUserTimeline, readMentions, readTweet, postTweet } from '@/actions/twitter'


function createMcpServer() {
  const server = new McpServer({
    name: "X Client",
    version: "1.0.0"
  });

  // Add an addition tool
  server.tool("readTweet",
    { url: z.string() },
    async ({ url }) => {
      // https://x.com/karpathy/status/1921368644069765486
      const regex = /https:\/\/x\.com\/([^/]+)\/status\/([^/]+)/
      const match = url.match(regex)
      if (!match) {
        return {
          content: [{ type: "text", text: "Invalid URL" }]
        }
      }
      const screen_name = match[1]
      const tweet_id = match[2]
      console.log('Reading tweet', screen_name, tweet_id)
      const tweet = await readTweet({ screen_name, tweet_id })
      console.log('Tweet read')
      let content = ""
      if (tweet.article) {
        content = tweet.article.map((block: any) => block.text).join("\n")
      } else {
        let lines = [tweet.text]
        for (const thread of tweet.threads || []) {
          lines.push(thread.text)
        }
        content = lines.join("\n")
      }
      return {
        content: [{ type: "text", text: content }]
      }
    }
  );
  return server
}

const app = new Hono()

app.use(logger())

app.get('/home_timeline', async (ctx) => {
  const tweets = await readHomeTimeline()
  return ctx.json(tweets)
})

app.get('/user/:screen_name', async (ctx) => {
  const { screen_name } = ctx.req.param()
  const tweets = await readUserTimeline({ screen_name })
  return ctx.json(tweets)
})

app.get('/mentions', async (ctx) => {
  const tweets = await readMentions()
  return ctx.json(tweets)
})

app.get('/user/:screen_name/:tweet_id', async (ctx) => {
  const { screen_name, tweet_id } = ctx.req.param()
  const tweet = await readTweet({ screen_name, tweet_id })
  return ctx.json(tweet)
})

app.get('/user/:screen_name/status/:tweet_id', async (ctx) => {
  const { screen_name, tweet_id } = ctx.req.param()
  const tweet = await readTweet({ screen_name, tweet_id })
  return ctx.json(tweet)
})

app.post('/tweets', async (ctx) => {
  const { text } = await ctx.req.json()
  await postTweet({ text: text as string })
  return ctx.json({ "success": true })
})

// Helper function to process page and extract content
async function processPage(url: string, selectors: Record<string, string>, timeoutSeconds = 10) {
  const requestStartTime = Date.now()
  console.log(`[${new Date().toISOString()}] Opening page:`, url)
  const openPageStart = Date.now()
  const { client } = await openPage({ url })
  console.log(`[${new Date().toISOString()}] openPage completed in ${Date.now() - openPageStart}ms`)
  
  const { Page, DOM, Runtime } = client

  try {
    const startTime = Date.now()
    console.log(`[${new Date().toISOString()}] Starting page processing...`)
    
    // Enable domains with timeout
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Enabling domains...`)
    await Promise.all([
      Promise.race([
        Page.enable(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Page.enable timeout')), 3000))
      ]),
      Promise.race([
        DOM.enable(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DOM.enable timeout')), 3000))
      ]),
      Promise.race([
        Runtime.enable(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Runtime.enable timeout')), 3000))
      ])
    ])
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Domains enabled`)

    // Check if this is full page request (empty selectors)
    if (Object.keys(selectors).length === 0) {
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] No selectors provided, getting full page HTML...`)
      
      // Wait a bit for page to fully load
      await new Promise(resolve => setTimeout(resolve, 2000))
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Getting full page HTML...`)
      
      const { result } = await Runtime.evaluate({
        expression: 'document.documentElement.outerHTML'
      })
      
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Full page HTML retrieved, length:`, result.value.length)
      
      return { 
        success: true,
        html: result.value,
        fullPage: true,
        length: result.value.length,
        processingTime: Date.now() - startTime,
        totalTime: Date.now() - requestStartTime
      }
    }
    
    // Process selectors
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Processing selectors:`, Object.keys(selectors))
    
    const { root: { nodeId } } = await DOM.getDocument()
    const results: Record<string, any> = {}
    
    // Process each selector
    for (const [keyName, selector] of Object.entries(selectors)) {
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Processing selector "${keyName}": ${selector}`)
      
      try {
        await waitForElement(client, selector, timeoutSeconds * 1000)
        const { nodeIds } = await DOM.querySelectorAll({ nodeId, selector })
        
        if (nodeIds.length > 0) {
          const { outerHTML } = await DOM.getOuterHTML({ nodeId: nodeIds[0] })
          results[keyName] = {
            success: true,
            html: outerHTML,
            nodeId: nodeIds[0],
            selector: selector,
            length: outerHTML.length
          }
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Selector "${keyName}" success, length:`, outerHTML.length)
        } else {
          results[keyName] = {
            success: false,
            error: 'Element found but no nodeIds returned',
            selector: selector
          }
        }
      } catch (error) {
        results[keyName] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          selector: selector
        }
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Selector "${keyName}" failed:`, error)
      }
    }
    
    return {
      success: true,
      results: results,
      processingTime: Date.now() - startTime,
      totalTime: Date.now() - requestStartTime
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error in page processing:`, e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    return {
      error: errorMessage,
      success: false,
      totalTime: Date.now() - requestStartTime,
      isError: true
    }
  } finally {
    console.log(`[${new Date().toISOString()}] Closing client...`)
    await client.close()
    console.log(`[${new Date().toISOString()}] Client closed, total request time: ${Date.now() - requestStartTime}ms`)
  }
}

app.get('/page/*', async (ctx) => {
  console.log(`[${new Date().toISOString()}] GET request received for page endpoint`)
  
  const path = ctx.req.path.split('/page/')[1]
  const selector = ctx.req.query('__selector__')
  
  // Remove __selector__ from query string
  const searchParams = new URLSearchParams(ctx.req.url.split('?')[1] || '')
  searchParams.delete('__selector__')
  const queryString = searchParams.toString()

  let url = `https://${path}`
  if (queryString) {
    url += `?${queryString}` 
  }
  
  // Convert single selector to selectors format, or empty for full page
  const selectors: Record<string, string> = selector ? { result: selector } : {}
  const result = await processPage(url, selectors)
  
  if (result.isError) {
    return ctx.json({ error: result.error, success: false }, 500)
  }
  
  // For single selector (GET), extract the result from results
  if (selector && result.results?.result) {
    const singleResult = result.results.result
    if (!singleResult.success) {
      return ctx.json({
        error: singleResult.error,
        selector: selector,
        processingTime: result.processingTime,
        totalTime: result.totalTime
      }, 404)
    }
    
    return ctx.json({
      success: true,
      html: singleResult.html,
      nodeId: singleResult.nodeId,
      selector: selector,
      length: singleResult.length,
      processingTime: result.processingTime,
      totalTime: result.totalTime
    })
  }
  
  return ctx.json(result)
})

app.post('/page/*', async (ctx) => {
  console.log(`[${new Date().toISOString()}] POST request received for page endpoint`)
  
  const path = ctx.req.path.split('/page/')[1]
  
  // Remove query string for POST
  const searchParams = new URLSearchParams(ctx.req.url.split('?')[1] || '')
  const queryString = searchParams.toString()

  let url = `https://${path}`
  if (queryString) {
    url += `?${queryString}` 
  }
  
  try {
    const body = await ctx.req.json()
    const { selectors, timeout = 10 } = body as { 
      selectors?: Record<string, string>, 
      timeout?: number 
    }
    
    if (!selectors || typeof selectors !== 'object') {
      return ctx.json({
        error: 'Invalid request body. Expected: { selectors: Record<string, string>, timeout?: number }',
        success: false
      }, 400)
    }
    
    console.log(`[${new Date().toISOString()}] POST selectors:`, Object.keys(selectors), 'timeout:', timeout)
    
    const result = await processPage(url, selectors, timeout)
    
    if (result.isError) {
      return ctx.json({ error: result.error, success: false }, 500)
    }
    
    return ctx.json(result)
  } catch (parseError) {
    console.error(`[${new Date().toISOString()}] Failed to parse POST body:`, parseError)
    return ctx.json({
      error: 'Invalid JSON in request body',
      success: false
    }, 400)
  }
})

app.get('/reset', async (ctx) => {
  await openPage({ url: 'about:blank' })
  return ctx.json({ "success": true })
})

// Cookie management routes
app.get('/cookies/:domain', async (ctx) => {
  const requestStartTime = Date.now()
  console.log(`[${new Date().toISOString()}] GET cookies request for domain:`, ctx.req.param('domain'))
  
  const domain = ctx.req.param('domain')
  const urls = ctx.req.query('urls') // Optional: specific URLs to get cookies for
  
  let urlList: string[] = []
  if (urls) {
    urlList = urls.split(',').map(url => url.trim())
  } else {
    // Default to domain with both http and https
    urlList = [`https://${domain}`, `http://${domain}`]
  }

  const { client } = await openPage({ url: 'about:blank' })
  const { Network } = client

  try {
    const startTime = Date.now()
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Enabling Network domain...`)
    
    await Network.enable()
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Network domain enabled`)

    const cookieResults: Record<string, any> = {}
    
    for (const url of urlList) {
      try {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Getting cookies for URL:`, url)
        const { cookies } = await Network.getCookies({ urls: [url] })
        cookieResults[url] = {
          success: true,
          cookies: cookies,
          count: cookies.length
        }
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Found ${cookies.length} cookies for ${url}`)
      } catch (error) {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Failed to get cookies for ${url}:`, error)
        cookieResults[url] = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          cookies: []
        }
      }
    }

    return ctx.json({
      success: true,
      domain: domain,
      results: cookieResults,
      processingTime: Date.now() - startTime,
      totalTime: Date.now() - requestStartTime
    })
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error in cookies GET handler:`, e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    return ctx.json({
      error: errorMessage,
      success: false,
      totalTime: Date.now() - requestStartTime
    }, 500)
  } finally {
    console.log(`[${new Date().toISOString()}] Closing client...`)
    await client.close()
    console.log(`[${new Date().toISOString()}] Client closed, total request time: ${Date.now() - requestStartTime}ms`)
  }
})

app.post('/cookies/:domain', async (ctx) => {
  const requestStartTime = Date.now()
  console.log(`[${new Date().toISOString()}] POST cookies request for domain:`, ctx.req.param('domain'))
  
  const domain = ctx.req.param('domain')
  
  try {
    const body = await ctx.req.json()
    const { cookies, action = 'set' } = body as { 
      cookies: Array<{
        name: string
        value: string
        domain?: string
        path?: string
        secure?: boolean
        httpOnly?: boolean
        expires?: number
        sameSite?: 'Strict' | 'Lax' | 'None'
      }>, 
      action?: 'set' | 'delete'
    }
    
    if (!cookies || !Array.isArray(cookies)) {
      return ctx.json({
        error: 'Invalid request body. Expected: { cookies: Array<Cookie>, action?: "set" | "delete" }',
        success: false
      }, 400)
    }
    
    console.log(`[${new Date().toISOString()}] ${action} ${cookies.length} cookies for domain:`, domain)

    const { client } = await openPage({ url: 'about:blank' })
    const { Network } = client

    try {
      const startTime = Date.now()
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Enabling Network domain...`)
      
      await Network.enable()
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Network domain enabled`)

      const results: Array<any> = []
      
      for (const cookie of cookies) {
        try {
          // Set default domain if not provided
          const cookieToProcess = {
            ...cookie,
            domain: cookie.domain || domain
          }
          
          if (action === 'set') {
            console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Setting cookie:`, cookieToProcess.name)
            const result = await Network.setCookie(cookieToProcess)
            results.push({
              success: result.success,
              cookie: cookieToProcess,
              error: result.success ? null : 'Failed to set cookie'
            })
          } else if (action === 'delete') {
            console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Deleting cookie:`, cookieToProcess.name)
            await Network.deleteCookies({
              name: cookieToProcess.name,
              domain: cookieToProcess.domain,
              path: cookieToProcess.path
            })
            results.push({
              success: true,
              cookie: cookieToProcess,
              action: 'deleted'
            })
          }
        } catch (error) {
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Failed to ${action} cookie ${cookie.name}:`, error)
          results.push({
            success: false,
            cookie: cookie,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      const successCount = results.filter(r => r.success).length
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] ${action} completed: ${successCount}/${cookies.length} successful`)

      return ctx.json({
        success: true,
        domain: domain,
        action: action,
        results: results,
        summary: {
          total: cookies.length,
          successful: successCount,
          failed: cookies.length - successCount
        },
        processingTime: Date.now() - startTime,
        totalTime: Date.now() - requestStartTime
      })
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error in cookies POST handler:`, e)
      const errorMessage = e instanceof Error ? e.message : String(e)
      return ctx.json({
        error: errorMessage,
        success: false,
        totalTime: Date.now() - requestStartTime
      }, 500)
    } finally {
      console.log(`[${new Date().toISOString()}] Closing client...`)
      await client.close()
      console.log(`[${new Date().toISOString()}] Client closed, total request time: ${Date.now() - requestStartTime}ms`)
    }
  } catch (parseError) {
    console.error(`[${new Date().toISOString()}] Failed to parse POST body:`, parseError)
    return ctx.json({
      error: 'Invalid JSON in request body',
      success: false
    }, 400)
  }
})

// Clear browser data route
app.delete('/clear/:domain?', async (ctx) => {
  const requestStartTime = Date.now()
  const domain = ctx.req.param('domain') // Optional domain parameter
  
  console.log(`[${new Date().toISOString()}] DELETE clear request${domain ? ` for domain: ${domain}` : ' (all data)'}`)
  
  // Get clear options from query parameters
  const clearCookies = ctx.req.query('cookies') !== 'false' // Default true
  const clearLocalStorage = ctx.req.query('localStorage') !== 'false' // Default true
  const clearSessionStorage = ctx.req.query('sessionStorage') !== 'false' // Default true
  const clearIndexedDB = ctx.req.query('indexedDB') !== 'false' // Default true
  const clearCache = ctx.req.query('cache') !== 'false' // Default true
  const clearAll = ctx.req.query('all') === 'true' // Clear all browser data

  const { client } = await openPage({ url: 'about:blank' })
  const { Network, Storage } = client

  try {
    const startTime = Date.now()
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Enabling domains...`)
    
    await Network.enable()
    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Domains enabled`)

    const results: Record<string, any> = {}

    if (clearAll || clearCookies) {
      try {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Clearing browser cookies...`)
        await Network.clearBrowserCookies()
        results.cookies = { success: true, action: 'cleared_all_cookies' }
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Browser cookies cleared`)
      } catch (error) {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Failed to clear cookies:`, error)
        results.cookies = { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        }
      }
    }

    if (clearAll || clearCache) {
      try {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Clearing browser cache...`)
        await Network.clearBrowserCache()
        results.cache = { success: true, action: 'cleared_browser_cache' }
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Browser cache cleared`)
      } catch (error) {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Failed to clear cache:`, error)
        results.cache = { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        }
      }
    }

    // If domain is specified, clear storage data for that domain
    if (domain && (clearAll || clearLocalStorage || clearSessionStorage || clearIndexedDB)) {
      const origins = [`https://${domain}`, `http://${domain}`]
      
      for (const origin of origins) {
        try {
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Clearing storage data for origin:`, origin)
          
          // Determine which storage types to clear
          const storageTypes: string[] = []
          if (clearAll || clearLocalStorage) storageTypes.push('local_storage')
          if (clearAll || clearSessionStorage) storageTypes.push('session_storage')
          if (clearAll || clearIndexedDB) storageTypes.push('indexeddb')
          if (clearAll || clearCookies) storageTypes.push('cookies')
          if (clearAll || clearCache) storageTypes.push('cache_storage')

          if (Storage.clearDataForOrigin) {
            await Storage.clearDataForOrigin({
              origin: origin,
              storageTypes: storageTypes.join(',')
            })
            
            results[origin] = { 
              success: true, 
              action: 'cleared_origin_data',
              storageTypes: storageTypes
            }
            console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Storage data cleared for ${origin}`)
          } else {
            results[origin] = { 
              success: false, 
              error: 'Storage.clearDataForOrigin not available'
            }
          }
        } catch (error) {
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Failed to clear storage for ${origin}:`, error)
          results[origin] = { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          }
        }
      }
    }

    const totalOperations = Object.keys(results).length
    const successfulOperations = Object.values(results).filter((r: any) => r.success).length

    console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Clear operations completed: ${successfulOperations}/${totalOperations} successful`)

    return ctx.json({
      success: true,
      domain: domain || 'all',
      operations: {
        clearCookies,
        clearLocalStorage,
        clearSessionStorage,
        clearIndexedDB,
        clearCache,
        clearAll
      },
      results: results,
      summary: {
        total: totalOperations,
        successful: successfulOperations,
        failed: totalOperations - successfulOperations
      },
      processingTime: Date.now() - startTime,
      totalTime: Date.now() - requestStartTime
    })
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error in clear handler:`, e)
    const errorMessage = e instanceof Error ? e.message : String(e)
    return ctx.json({
      error: errorMessage,
      success: false,
      totalTime: Date.now() - requestStartTime
    }, 500)
  } finally {
    console.log(`[${new Date().toISOString()}] Closing client...`)
    await client.close()
    console.log(`[${new Date().toISOString()}] Client closed, total request time: ${Date.now() - requestStartTime}ms`)
  }
})

// POST variant for clear operation (alternative to DELETE)
app.post('/clear/:domain?', async (ctx) => {
  const requestStartTime = Date.now()
  const domain = ctx.req.param('domain')
  
  console.log(`[${new Date().toISOString()}] POST clear request${domain ? ` for domain: ${domain}` : ' (all data)'}`)
  
  try {
    const body = await ctx.req.json()
    const { 
      cookies = true,
      localStorage = true,
      sessionStorage = true,
      indexedDB = true,
      cache = true,
      all = false
    } = body as {
      cookies?: boolean
      localStorage?: boolean
      sessionStorage?: boolean
      indexedDB?: boolean
      cache?: boolean
      all?: boolean
    }

    const { client } = await openPage({ url: 'about:blank' })
    const { Network, Storage } = client

    try {
      const startTime = Date.now()
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Enabling domains...`)
      
      await Network.enable()
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Domains enabled`)

      const results: Record<string, any> = {}

      if (all || cookies) {
        try {
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Clearing browser cookies...`)
          await Network.clearBrowserCookies()
          results.cookies = { success: true, action: 'cleared_all_cookies' }
        } catch (error) {
          results.cookies = { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          }
        }
      }

      if (all || cache) {
        try {
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Clearing browser cache...`)
          await Network.clearBrowserCache()
          results.cache = { success: true, action: 'cleared_browser_cache' }
        } catch (error) {
          results.cache = { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          }
        }
      }

      if (domain && (all || localStorage || sessionStorage || indexedDB)) {
        const origins = [`https://${domain}`, `http://${domain}`]
        
        for (const origin of origins) {
          try {
            const storageTypes: string[] = []
            if (all || localStorage) storageTypes.push('local_storage')
            if (all || sessionStorage) storageTypes.push('session_storage')
            if (all || indexedDB) storageTypes.push('indexeddb')
            if (all || cookies) storageTypes.push('cookies')
            if (all || cache) storageTypes.push('cache_storage')

            if (Storage.clearDataForOrigin) {
              await Storage.clearDataForOrigin({
                origin: origin,
                storageTypes: storageTypes.join(',')
              })
              
              results[origin] = { 
                success: true, 
                action: 'cleared_origin_data',
                storageTypes: storageTypes
              }
            } else {
              results[origin] = { 
                success: false, 
                error: 'Storage.clearDataForOrigin not available'
              }
            }
          } catch (error) {
            results[origin] = { 
              success: false, 
              error: error instanceof Error ? error.message : String(error) 
            }
          }
        }
      }

      const totalOperations = Object.keys(results).length
      const successfulOperations = Object.values(results).filter((r: any) => r.success).length

      return ctx.json({
        success: true,
        domain: domain || 'all',
        operations: {
          cookies,
          localStorage,
          sessionStorage,
          indexedDB,
          cache,
          all
        },
        results: results,
        summary: {
          total: totalOperations,
          successful: successfulOperations,
          failed: totalOperations - successfulOperations
        },
        processingTime: Date.now() - startTime,
        totalTime: Date.now() - requestStartTime
      })
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error in clear POST handler:`, e)
      const errorMessage = e instanceof Error ? e.message : String(e)
      return ctx.json({
        error: errorMessage,
        success: false,
        totalTime: Date.now() - requestStartTime
      }, 500)
    } finally {
      await client.close()
    }
  } catch (parseError) {
    console.error(`[${new Date().toISOString()}] Failed to parse POST body:`, parseError)
    return ctx.json({
      error: 'Invalid JSON in request body',
      success: false
    }, 400)
  }
})

const transports: Record<string, SSETransport> = {}
const server = createMcpServer()

app.get('/sse', (c) => {
  console.log('Received GET SSE request')
  return streamSSE(c, async (stream) => {
    const transport = new SSETransport('/messages', stream);

    transports[transport.sessionId] = transport;

    stream.onAbort(() => {
      delete transports[transport.sessionId];
    });

    await server.connect(transport);
    while (true) {
      // This will keep the connection alive
      // You can also await for a promise that never resolves
      await stream.sleep(60_000);
    }
  });
});

app.post('/messages', async (c) => {
  const sessionId = c.req.query('sessionId');
  const transport = transports[sessionId!];

  if (!transport) {
    return c.text('No transport found for sessionId', 400);
  }

  return await transport.handlePostMessage(c as any);
});

app.post("/mcp", async (c) => {
  const { req, res } = toReqRes(c.req.raw);

  const server = createMcpServer();

  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

    // Added for extra debuggability
    transport.onerror = console.error.bind(console);

    await server.connect(transport);

    await transport.handleRequest(req, res, await c.req.json());

    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });

    return toFetchResponse(res);
  } catch (e) {
    console.error(e);
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      },
      { status: 500 }
    );
  }
});

app.get("/mcp", async (c) => {
  console.log("Received GET MCP request");
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 }
  );
});

app.delete("/mcp", async (c) => {
  console.log("Received DELETE MCP request");
  return c.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    },
    { status: 405 }
  );
});

serve({
  fetch: app.fetch,
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
})