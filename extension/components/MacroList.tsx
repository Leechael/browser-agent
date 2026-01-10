import { useState, useEffect, useRef } from 'react'
import type { Macro } from '@/utils/types'
import { STORAGE_KEYS } from '@/utils/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface MacroListProps {
  serverConnected: boolean
}

export default function MacroList({ serverConnected }: MacroListProps) {
  const [macros, setMacros] = useState<Macro[]>([])
  const [playing, setPlaying] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const loadMacros = async () => {
    const data = await browser.storage.local.get(STORAGE_KEYS.MACROS)
    setMacros((data[STORAGE_KEYS.MACROS] as Macro[]) || [])
  }

  useEffect(() => {
    loadMacros()
  }, [])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const handleStartEdit = (macro: Macro) => {
    setEditingId(macro.id)
    setEditingName(macro.name)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) {
      setEditingId(null)
      return
    }

    const updatedMacros = macros.map((m) =>
      m.id === editingId ? { ...m, name: editingName.trim(), updatedAt: Date.now() } : m
    )
    await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: updatedMacros })
    setMacros(updatedMacros)
    setEditingId(null)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  const handleOpenFullPage = () => {
    browser.tabs.create({ url: browser.runtime.getURL('/macros.html') })
  }

  const handlePlayback = async (macro: Macro) => {
    if (!serverConnected) {
      setMessage({ type: 'error', text: 'Server is not connected' })
      return
    }

    setPlaying(macro.id)
    setMessage(null)

    try {
      const result = await browser.runtime.sendMessage({
        type: 'PLAYBACK_MACRO',
        payload: {
          macro,
          options: {
            speed: 1.0,
            humanize: true,
            stopOnError: true,
          },
        },
        timestamp: Date.now(),
      })

      if (result.success) {
        setMessage({ type: 'success', text: `Playback completed: ${result.executedActions} actions` })
      } else {
        const errorText = result.error || (result.errors?.length ? JSON.stringify(result.errors[0]) : 'Playback failed')
        setMessage({ type: 'error', text: errorText })
        console.error('Playback result:', result)
      }
    } catch (error) {
      console.error('Playback error:', error)
      setMessage({ type: 'error', text: error instanceof Error ? error.message : String(error) })
    } finally {
      setPlaying(null)
    }
  }

  const handleDelete = async (macroId: string) => {
    const confirmed = confirm('Are you sure you want to delete this macro?')
    if (!confirmed) return

    const updatedMacros = macros.filter((m) => m.id !== macroId)
    await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: updatedMacros })
    setMacros(updatedMacros)
  }

  const handleExport = (macro: Macro) => {
    const json = JSON.stringify(macro, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${macro.name.replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const macro = JSON.parse(text) as Macro

        macro.id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
        macro.createdAt = Date.now()
        macro.updatedAt = Date.now()

        const updatedMacros = [...macros, macro]
        await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: updatedMacros })
        setMacros(updatedMacros)
        setMessage({ type: 'success', text: `Imported: ${macro.name}` })
      } catch {
        setMessage({ type: 'error', text: 'Invalid macro file' })
      }
    }
    input.click()
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString()
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

      {macros.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No macros recorded yet</p>
          <p className="text-xs text-muted-foreground mt-2">
            Go to the Recorder tab to create your first macro
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {macros.map((macro) => (
            <div
              key={macro.id}
              className="flex items-center justify-between px-3 py-2.5 border-b border-border last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                {editingId === macro.id ? (
                  <Input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    className="h-6 text-sm"
                  />
                ) : (
                  <div
                    className="text-sm font-medium truncate cursor-pointer hover:text-primary"
                    onClick={() => handleStartEdit(macro)}
                    title="Click to edit name"
                  >
                    {macro.name}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {macro.actions.length} actions · {formatDate(macro.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handlePlayback(macro)}
                  disabled={playing !== null}
                  title="Play"
                >
                  {playing === macro.id ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  )}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleExport(macro)} title="Export">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(macro.id)} title="Delete">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={handleImport}>
          Import
        </Button>
        {macros.length > 0 && (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              const all = JSON.stringify(macros, null, 2)
              const blob = new Blob([all], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'all_macros.json'
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export All
          </Button>
        )}
      </div>

      {/* Open in Full Page button */}
      <Button variant="outline" className="w-full" onClick={handleOpenFullPage}>
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Open in Full Page
      </Button>
    </div>
  )
}
