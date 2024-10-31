import { openPage, waitForElement, clickElement, typeHumanLike, type PageOptions } from '../common'

export type PostTweetOptions = {
  text: string
} & Omit<PageOptions, 'url'>

export async function postTweet({ text, ...options }: PostTweetOptions): Promise<void> {
  const { client } = await openPage({ ...(options || {}), url: 'https://x.com/home' })
  try {
    const { Page, Runtime } = client
    
    await Promise.all([
      Page.enable(),
      Runtime.enable()
    ])
    
    await waitForElement(client, '[aria-label=Post]')
    await clickElement(client, '[aria-label=Post]')
    
    await waitForElement(client, '.DraftEditor-root')
    await clickElement(client, '.DraftEditor-root')
    
    await new Promise(resolve => setTimeout(resolve, 500))
    await typeHumanLike(client, text)
    
    await waitForElement(client, 'button[data-testid="tweetButton"]')
    await clickElement(client, 'button[data-testid="tweetButton"]')
    
  } catch (err) {
    console.error('Error posting tweet:', err)
    throw err
  } finally {
    await client.close()
  }
}

