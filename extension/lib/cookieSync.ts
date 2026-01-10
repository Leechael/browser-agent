import type { CookieItem, CookieSyncConfig, CookieSyncResult } from '@/utils/types'
import { getApiClient } from './apiClient'

export class CookieSyncManager {
  private config: CookieSyncConfig
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private lastSyncResults: Map<string, CookieSyncResult> = new Map()

  constructor(config: CookieSyncConfig) {
    this.config = config
  }

  updateConfig(config: Partial<CookieSyncConfig>) {
    this.config = { ...this.config, ...config }
    if (this.config.autoSync && this.config.enabled) {
      this.startAutoSync()
    } else {
      this.stopAutoSync()
    }
  }

  getConfig(): CookieSyncConfig {
    return { ...this.config }
  }

  // Check if the domain should be synced
  private shouldSyncDomain(domain: string): boolean {
    // Blacklist takes priority
    if (this.config.excludedDomains.some((d) => domain.includes(d))) {
      return false
    }
    // If whitelist exists, only sync domains in the whitelist
    if (this.config.includedDomains.length > 0) {
      return this.config.includedDomains.some((d) => domain.includes(d))
    }
    return true
  }

  // Get cookies from the current tab
  async getCurrentTabCookies(
    tabId: number
  ): Promise<{ domain: string; cookies: CookieItem[] } | null> {
    const tab = await browser.tabs.get(tabId)
    if (!tab.url) return null

    const url = new URL(tab.url)
    const domain = url.hostname

    if (!this.shouldSyncDomain(domain)) {
      return null
    }

    const cookies = await browser.cookies.getAll({ domain })

    return {
      domain,
      cookies: cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        expires: c.expirationDate,
        sameSite: c.sameSite as CookieItem['sameSite'],
      })),
    }
  }

  // Sync cookies for a specific domain to the server
  async syncCookies(domain: string, cookies: CookieItem[]): Promise<CookieSyncResult> {
    const result: CookieSyncResult = {
      success: false,
      domain,
      cookieCount: cookies.length,
      timestamp: Date.now(),
    }

    try {
      const client = getApiClient()
      await client.setCookies(domain, cookies)
      result.success = true
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }

    this.lastSyncResults.set(domain, result)
    return result
  }

  // Sync the current tab
  async syncCurrentTab(tabId: number): Promise<CookieSyncResult | null> {
    const data = await this.getCurrentTabCookies(tabId)
    if (!data) return null

    return this.syncCookies(data.domain, data.cookies)
  }

  // Start auto sync
  startAutoSync() {
    this.stopAutoSync()

    if (!this.config.autoSync || !this.config.enabled) return

    this.syncTimer = setInterval(async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.id) {
        await this.syncCurrentTab(tabs[0].id)
      }
    }, this.config.syncInterval)
  }

  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  getLastSyncResult(domain: string): CookieSyncResult | undefined {
    return this.lastSyncResults.get(domain)
  }

  getAllSyncResults(): CookieSyncResult[] {
    return Array.from(this.lastSyncResults.values())
  }

  clearSyncHistory() {
    this.lastSyncResults.clear()
  }
}

// Cookie change listener
export function setupCookieChangeListener(manager: CookieSyncManager) {
  browser.cookies.onChanged.addListener(async (changeInfo) => {
    // Only handle set operations, ignore deletions
    if (changeInfo.removed) return

    const config = manager.getConfig()
    if (!config.autoSync || !config.enabled) return

    const domain = changeInfo.cookie.domain.replace(/^\./, '')

    // Get all cookies for this domain and sync
    const cookies = await browser.cookies.getAll({ domain })
    const cookieItems: CookieItem[] = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      expires: c.expirationDate,
      sameSite: c.sameSite as CookieItem['sameSite'],
    }))

    await manager.syncCookies(domain, cookieItems)
  })
}
