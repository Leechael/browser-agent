import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'

import { openPage } from '@/actions/common/openPage'
import { readHomeTimeline, readUserTimeline, readMentions, readTweet, postTweet } from '@/actions/twitter'

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

serve({
  fetch: app.fetch,
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
})