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