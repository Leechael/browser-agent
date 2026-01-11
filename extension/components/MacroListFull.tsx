import { useState, useEffect, useRef } from 'react'
import type { Macro } from '@/utils/types'
import { STORAGE_KEYS } from '@/utils/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface MacroListFullProps {
  serverConnected: boolean
  onEdit?: (macro: Macro) => void
}

export default function MacroListFull({ serverConnected, onEdit }: MacroListFullProps) {
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
      }
    } catch (error) {
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
        const parsed = JSON.parse(text)

        // Validate required fields
        if (!parsed.name || typeof parsed.name !== 'string') {
          throw new Error('Missing or invalid macro name')
        }
        if (!parsed.startUrl || typeof parsed.startUrl !== 'string') {
          throw new Error('Missing or invalid startUrl')
        }
        if (!Array.isArray(parsed.actions)) {
          throw new Error('Missing or invalid actions array')
        }

        const macro: Macro = {
          ...parsed,
          id: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        const updatedMacros = [...macros, macro]
        await browser.storage.local.set({ [STORAGE_KEYS.MACROS]: updatedMacros })
        setMacros(updatedMacros)
        setMessage({ type: 'success', text: `Imported: ${macro.name}` })
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Invalid macro file'
        setMessage({ type: 'error', text: msg })
      }
    }
    input.click()
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatDuration = (macro: Macro) => {
    if (macro.actions.length === 0) return '0s'
    const lastAction = macro.actions[macro.actions.length - 1]
    const seconds = Math.ceil(lastAction.timestamp / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Saved Macros</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleImport}>
            Import
          </Button>
          {macros.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
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
      </div>

      {/* Message */}
      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Macros Grid */}
      {macros.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-lg border border-border">
          <svg className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-muted-foreground">No macros recorded yet</p>
          <p className="text-sm text-muted-foreground mt-1">Use the recorder to create your first macro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {macros.map((macro) => (
            <div
              key={macro.id}
              className="bg-card rounded-lg border border-border p-4 hover:shadow-md transition-shadow"
            >
              {/* Macro Name */}
              <div className="flex items-start justify-between mb-3">
                {editingId === macro.id ? (
                  <Input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    className="h-7 text-sm font-medium"
                  />
                ) : (
                  <h3
                    className="text-sm font-medium cursor-pointer hover:text-primary truncate flex-1 mr-2"
                    onClick={() => handleStartEdit(macro)}
                    title="Click to edit name"
                  >
                    {macro.name}
                  </h3>
                )}
              </div>

              {/* Macro Info */}
              <div className="space-y-1 text-xs text-muted-foreground mb-4">
                <div className="flex justify-between">
                  <span>Actions</span>
                  <span className="font-medium text-foreground">{macro.actions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="font-medium text-foreground">{formatDuration(macro)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>{formatDate(macro.createdAt)}</span>
                </div>
                {macro.startUrl && (
                  <div className="flex justify-between">
                    <span>Start URL</span>
                    <span className="truncate max-w-[180px]" title={macro.startUrl}>
                      {(() => {
                        try {
                          return new URL(macro.startUrl).hostname
                        } catch {
                          return macro.startUrl
                        }
                      })()}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1"
                  onClick={() => handlePlayback(macro)}
                  disabled={playing !== null || !serverConnected}
                >
                  {playing === macro.id ? (
                    <>
                      <svg className="w-4 h-4 animate-spin mr-1.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Playing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      Play
                    </>
                  )}
                </Button>
                {onEdit && (
                  <Button variant="ghost" size="icon-sm" onClick={() => onEdit(macro)} title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </Button>
                )}
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
    </div>
  )
}
