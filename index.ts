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

app.get('/page/*', async (ctx) => {
  const requestStartTime = Date.now()
  console.log(`[${new Date().toISOString()}] Request received for page endpoint`)
  
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
    
    if (selector) {
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Selector provided:`, selector)
      
      // Use waitForElement to wait for the specific element
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Waiting for element...`)
      try {
        await waitForElement(client, selector, 10000) // 10 second timeout
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Element found, getting HTML...`)
        
        const { root: { nodeId } } = await DOM.getDocument()
        const { nodeIds } = await DOM.querySelectorAll({ nodeId, selector })
        
        if (nodeIds.length > 0) {
          const { outerHTML } = await DOM.getOuterHTML({ nodeId: nodeIds[0] })
          console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] HTML extraction success, length:`, outerHTML.length)
          
          return ctx.json({ 
            success: true,
            html: outerHTML,
            nodeId: nodeIds[0],
            selector: selector,
            length: outerHTML.length,
            processingTime: Date.now() - startTime,
            totalTime: Date.now() - requestStartTime
          })
        }
      } catch (waitError) {
        console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] waitForElement failed:`, waitError)
        return ctx.json({ 
          error: 'Element not found within timeout',
          selector: selector,
          processingTime: Date.now() - startTime,
          totalTime: Date.now() - requestStartTime
        }, 404)
      }
    } else {
      // No selector - return full page HTML
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] No selector provided, getting full page HTML...`)
      
      // Wait a bit for page to fully load
      await new Promise(resolve => setTimeout(resolve, 2000))
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Getting full page HTML...`)
      
      const { result } = await Runtime.evaluate({
        expression: 'document.documentElement.outerHTML'
      })
      
      console.log(`[${new Date().toISOString()}] [+${Date.now() - startTime}ms] Full page HTML retrieved, length:`, result.value.length)
      
      return ctx.json({ 
        success: true,
        html: result.value,
        fullPage: true,
        length: result.value.length,
        processingTime: Date.now() - startTime,
        totalTime: Date.now() - requestStartTime
      })
    }

    return ctx.json({ 
      error: 'Unknown error',
      processingTime: Date.now() - startTime,
      totalTime: Date.now() - requestStartTime
    }, 500)
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Error in page handler:`, e)
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

app.get('/reset', async (ctx) => {
  await openPage({ url: 'about:blank' })
  return ctx.json({ "success": true })
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

  return await transport.handlePostMessage(c);
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