import { useState, useEffect } from 'react'
import type { ExtensionSettings } from '@/utils/types'
import { DEFAULT_SETTINGS } from '@/utils/constants'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

interface SettingsProps {
  settings: ExtensionSettings | null
  onSettingsChange: () => void
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="rounded-lg border border-border p-3 space-y-1">
        {children}
      </div>
    </div>
  )
}

export default function Settings({ settings: initialSettings, onSettingsChange }: SettingsProps) {
  const [settings, setSettings] = useState<ExtensionSettings>(initialSettings || DEFAULT_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings)
    }
  }, [initialSettings])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      await browser.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: settings,
        timestamp: Date.now(),
      })
      setMessage({ type: 'success', text: 'Settings saved' })
      onSettingsChange()
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch(`${settings.serverUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Connection successful' })
      } else {
        setMessage({ type: 'error', text: `Server returned ${response.status}` })
      }
    } catch {
      setMessage({ type: 'error', text: 'Connection failed' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`px-3 py-2 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <Section title="Server">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Server URL
            </label>
            <Input
              type="text"
              value={settings.serverUrl}
              onChange={(e) => setSettings({ ...settings, serverUrl: e.target.value })}
              placeholder="http://localhost:3000"
            />
          </div>
          <Button variant="outline" className="w-full" onClick={handleTestConnection} disabled={saving}>
            Test Connection
          </Button>
        </div>
      </Section>

      <Section title="Cookie Sync">
        <SettingRow label="Enable cookie sync">
          <Switch
            checked={settings.cookieSync.enabled}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                cookieSync: { ...settings.cookieSync, enabled: checked },
              })
            }
          />
        </SettingRow>
        <SettingRow label="Auto-sync on change">
          <Switch
            checked={settings.cookieSync.autoSync}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                cookieSync: { ...settings.cookieSync, autoSync: checked },
              })
            }
          />
        </SettingRow>
      </Section>

      <Section title="Recording">
        <SettingRow label="Capture scroll events">
          <Switch
            checked={settings.recording.captureScroll}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                recording: { ...settings.recording, captureScroll: checked },
              })
            }
          />
        </SettingRow>
        <SettingRow label="Capture hover events">
          <Switch
            checked={settings.recording.captureHover}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                recording: { ...settings.recording, captureHover: checked },
              })
            }
          />
        </SettingRow>
        <SettingRow label="Generate XPath backup">
          <Switch
            checked={settings.recording.generateXPath}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                recording: { ...settings.recording, generateXPath: checked },
              })
            }
          />
        </SettingRow>
      </Section>

      <Section title="Playback">
        <div className="py-2">
          <label className="text-sm mb-1 block">Speed</label>
          <Select
            value={String(settings.playback.speed)}
            onChange={(e) =>
              setSettings({
                ...settings,
                playback: { ...settings.playback, speed: parseFloat(e.target.value) },
              })
            }
          >
            <option value="0.5">0.5x (Slow)</option>
            <option value="1">1x (Normal)</option>
            <option value="1.5">1.5x (Fast)</option>
            <option value="2">2x (Very Fast)</option>
          </Select>
        </div>
        <SettingRow label="Humanize delays">
          <Switch
            checked={settings.playback.humanize}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                playback: { ...settings.playback, humanize: checked },
              })
            }
          />
        </SettingRow>
        <SettingRow label="Stop on error">
          <Switch
            checked={settings.playback.stopOnError}
            onCheckedChange={(checked) =>
              setSettings({
                ...settings,
                playback: { ...settings.playback, stopOnError: checked },
              })
            }
          />
        </SettingRow>
      </Section>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  )
}
