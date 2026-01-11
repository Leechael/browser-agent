import type { CookieItem, Macro, PlaybackResult, PlaybackOptions } from '@/utils/types'

export class BrowserAgentClient {
  private baseUrl: string

  constructor(serverUrl: string) {
    this.baseUrl = serverUrl.replace(/\/$/, '')
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '')
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  // Cookie-related API
  async getCookies(domain: string): Promise<CookieItem[]> {
    const response = await fetch(`${this.baseUrl}/cookies/${domain}`)
    if (!response.ok) {
      throw new Error(`Failed to get cookies: ${response.statusText}`)
    }
    const data = await response.json()
    const allCookies: CookieItem[] = []
    for (const result of Object.values(data.results) as { success: boolean; cookies?: CookieItem[] }[]) {
      if (result.success && result.cookies) {
        allCookies.push(...result.cookies)
      }
    }
    return allCookies
  }

  async setCookies(domain: string, cookies: CookieItem[]): Promise<{ success: boolean; results: unknown[] }> {
    const response = await fetch(`${this.baseUrl}/cookies/${domain}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cookies }),
    })

    if (!response.ok) {
      throw new Error(`Failed to set cookies: ${response.statusText}`)
    }

    return response.json()
  }

  async setCookiesRaw(domain: string, cookieString: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/cookies/${domain}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: cookieString,
    })

    if (!response.ok) {
      throw new Error(`Failed to set cookies: ${response.statusText}`)
    }

    return response.json()
  }

  // Macro playback API
  async playbackMacro(macro: Macro, options: PlaybackOptions): Promise<PlaybackResult> {
    const response = await fetch(`${this.baseUrl}/macro/playback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ macro, options }),
    })

    if (!response.ok) {
      throw new Error(`Failed to playback macro: ${response.statusText}`)
    }

    return response.json()
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/reset`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }
}

// Singleton instance
let clientInstance: BrowserAgentClient | null = null

export function getApiClient(serverUrl?: string): BrowserAgentClient {
  if (!clientInstance && serverUrl) {
    clientInstance = new BrowserAgentClient(serverUrl)
  }
  if (!clientInstance) {
    throw new Error('API client not initialized')
  }
  return clientInstance
}

export function initApiClient(serverUrl: string): BrowserAgentClient {
  clientInstance = new BrowserAgentClient(serverUrl)
  return clientInstance
}
