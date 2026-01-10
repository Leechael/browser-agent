import { useState, useEffect } from 'react'
import type { CookieSyncResult } from '@/utils/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

interface CookieSyncProps {
  serverConnected: boolean
}

export default function CookieSync({ serverConnected }: CookieSyncProps) {
  const [currentDomain, setCurrentDomain] = useState<string>('')
  const [cookieCount, setCookieCount] = useState<number>(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<CookieSyncResult | null>(null)
  const [autoSync, setAutoSync] = useState(false)

  useEffect(() => {
    const getCurrentTab = async () => {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url)
          setCurrentDomain(url.hostname)

          const cookies = await browser.cookies.getAll({ domain: url.hostname })
          setCookieCount(cookies.length)
        } catch {
          setCurrentDomain('N/A')
          setCookieCount(0)
        }
      }
    }

    getCurrentTab()
  }, [])

  const handleSync = async () => {
    if (!currentDomain || currentDomain === 'N/A') return

    setSyncing(true)
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.id) {
        const result = await browser.runtime.sendMessage({
          type: 'SYNC_COOKIES',
          payload: {},
          tabId: tabs[0].id,
          timestamp: Date.now(),
        })
        setLastSync(result as CookieSyncResult)
      }
    } catch (error) {
      setLastSync({
        success: false,
        domain: currentDomain,
        cookieCount: 0,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setSyncing(false)
    }
  }

  const handleAutoSyncChange = async (enabled: boolean) => {
    setAutoSync(enabled)
    await browser.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        cookieSync: {
          autoSync: enabled,
        },
      },
      timestamp: Date.now(),
    })
  }

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`
    return new Date(timestamp).toLocaleTimeString()
  }

  return (
    <div className="space-y-4">
      {/* Current Site Section */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Current Site
        </h3>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Domain</span>
            <span className="text-sm font-medium">{currentDomain || 'Loading...'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Cookies</span>
            <span className="text-sm font-medium">{cookieCount}</span>
          </div>
          {lastSync && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Last sync</span>
              <span className="text-sm font-medium">{formatTime(lastSync.timestamp)}</span>
            </div>
          )}
        </div>

        {lastSync && (
          <div
            className={`mt-3 px-3 py-2 rounded-lg text-sm ${
              lastSync.success
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {lastSync.success
              ? `Successfully synced ${lastSync.cookieCount} cookies`
              : `Sync failed: ${lastSync.error}`}
          </div>
        )}

        <Button
          className="mt-3 w-full"
          onClick={handleSync}
          disabled={syncing || !serverConnected || !currentDomain || currentDomain === 'N/A'}
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </Button>

        {!serverConnected && (
          <div className="mt-3 px-3 py-2 rounded-lg text-sm bg-red-100 text-red-800">
            Server is not connected. Check your settings.
          </div>
        )}
      </div>

      {/* Auto Sync Section */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Auto Sync
        </h3>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Sync cookies automatically on change</span>
            <Switch checked={autoSync} onCheckedChange={handleAutoSyncChange} />
          </div>
        </div>
      </div>
    </div>
  )
}
