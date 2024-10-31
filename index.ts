import { Hono } from 'hono'
import { serve } from '@hono/node-server'

import { readHomeTimeline, readUserTimeline, readMentions, readTweet, postTweet } from '@/actions/twitter'

const app = new Hono()

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

app.post('/tweets', async (ctx) => {
  const { text } = await ctx.req.json()
  await postTweet({ text: text as string })
  return ctx.json({ "success": true })
})

serve(app)