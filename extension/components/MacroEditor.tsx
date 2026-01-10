import { useState } from 'react'
import type { Macro, MacroAction, MacroActionType } from '@/utils/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface MacroEditorProps {
  macro: Macro
  onSave: (macro: Macro) => void
  onClose: () => void
  error?: string | null
}

const ACTION_TYPES: MacroActionType[] = [
  'click',
  'dblclick',
  'type',
  'keypress',
  'scroll',
  'select',
  'wait',
  'navigate',
  'hover',
]

const ACTION_LABELS: Record<MacroActionType, string> = {
  click: 'Click',
  dblclick: 'Double Click',
  type: 'Type Text',
  keypress: 'Key Press',
  scroll: 'Scroll',
  select: 'Select',
  wait: 'Wait',
  navigate: 'Navigate',
  hover: 'Hover',
}

const ACTION_COLORS: Record<MacroActionType, string> = {
  click: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  dblclick: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  type: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  keypress: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  scroll: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  select: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  wait: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  navigate: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  hover: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

function ActionEditor({
  action,
  index,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  action: MacroAction
  index: number
  onChange: (action: MacroAction) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const getActionSummary = () => {
    switch (action.type) {
      case 'click':
      case 'dblclick':
        return action.elementInfo?.text
          ? `"${action.elementInfo.text.slice(0, 30)}${action.elementInfo.text.length > 30 ? '...' : ''}"`
          : action.selector.slice(0, 40)
      case 'type':
        return `"${action.value?.slice(0, 30)}${(action.value?.length ?? 0) > 30 ? '...' : ''}"`
      case 'keypress':
        const mods = []
        if (action.keyInfo?.modifiers.ctrl) mods.push('Ctrl')
        if (action.keyInfo?.modifiers.alt) mods.push('Alt')
        if (action.keyInfo?.modifiers.shift) mods.push('Shift')
        if (action.keyInfo?.modifiers.meta) mods.push('Cmd')
        mods.push(action.keyInfo?.key || '')
        return mods.join('+')
      case 'scroll':
        return `(${action.scrollDelta?.deltaX ?? 0}, ${action.scrollDelta?.deltaY ?? 0})`
      case 'wait':
        return `${action.waitDuration ?? 0}ms`
      case 'navigate':
        return action.value || ''
      case 'select':
        return action.value || ''
      default:
        return action.selector.slice(0, 40)
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs text-muted-foreground font-mono w-6">{index + 1}</span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${ACTION_COLORS[action.type]}`}>
          {ACTION_LABELS[action.type]}
        </span>
        <span className="flex-1 text-sm text-muted-foreground truncate">{getActionSummary()}</span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDelete} title="Delete">
            <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Editor */}
      {expanded && (
        <div className="p-3 space-y-3 bg-background">
          {/* Action Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
            <select
              value={action.type}
              onChange={(e) => onChange({ ...action, type: e.target.value as MacroActionType })}
              className="w-full h-8 px-2 text-sm border border-input rounded-md bg-background"
            >
              {ACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTION_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {/* Selector */}
          {action.type !== 'wait' && action.type !== 'navigate' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Selector</label>
              <Input
                value={action.selector}
                onChange={(e) => onChange({ ...action, selector: e.target.value })}
                placeholder="CSS selector"
                className="h-8 text-sm font-mono"
              />
            </div>
          )}

          {/* XPath */}
          {action.xpath && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">XPath</label>
              <Input
                value={action.xpath}
                onChange={(e) => onChange({ ...action, xpath: e.target.value })}
                placeholder="XPath"
                className="h-8 text-sm font-mono"
              />
            </div>
          )}

          {/* Value (for type, select, navigate) */}
          {(action.type === 'type' || action.type === 'select' || action.type === 'navigate') && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {action.type === 'navigate' ? 'URL' : 'Value'}
              </label>
              <Input
                value={action.value || ''}
                onChange={(e) => onChange({ ...action, value: e.target.value })}
                placeholder={action.type === 'navigate' ? 'https://...' : 'Text to type'}
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Wait Duration */}
          {action.type === 'wait' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Duration (ms)
              </label>
              <Input
                type="number"
                value={action.waitDuration || 0}
                onChange={(e) => onChange({ ...action, waitDuration: parseInt(e.target.value) || 0 })}
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Coordinates */}
          {(action.type === 'click' || action.type === 'dblclick') && action.coordinates && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">X</label>
                <Input
                  type="number"
                  value={action.coordinates.x}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      coordinates: { ...action.coordinates!, x: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Y</label>
                <Input
                  type="number"
                  value={action.coordinates.y}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      coordinates: { ...action.coordinates!, y: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* Scroll Delta */}
          {action.type === 'scroll' && action.scrollDelta && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delta X</label>
                <Input
                  type="number"
                  value={action.scrollDelta.deltaX}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      scrollDelta: { ...action.scrollDelta!, deltaX: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Delta Y</label>
                <Input
                  type="number"
                  value={action.scrollDelta.deltaY}
                  onChange={(e) =>
                    onChange({
                      ...action,
                      scrollDelta: { ...action.scrollDelta!, deltaY: parseInt(e.target.value) || 0 },
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {/* Key Info */}
          {action.type === 'keypress' && action.keyInfo && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Key</label>
                  <Input
                    value={action.keyInfo.key}
                    onChange={(e) =>
                      onChange({
                        ...action,
                        keyInfo: { ...action.keyInfo!, key: e.target.value },
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Code</label>
                  <Input
                    value={action.keyInfo.code}
                    onChange={(e) =>
                      onChange({
                        ...action,
                        keyInfo: { ...action.keyInfo!, code: e.target.value },
                      })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                {(['ctrl', 'alt', 'shift', 'meta'] as const).map((mod) => (
                  <label key={mod} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={action.keyInfo!.modifiers[mod]}
                      onChange={(e) =>
                        onChange({
                          ...action,
                          keyInfo: {
                            ...action.keyInfo!,
                            modifiers: { ...action.keyInfo!.modifiers, [mod]: e.target.checked },
                          },
                        })
                      }
                      className="rounded"
                    />
                    {mod.charAt(0).toUpperCase() + mod.slice(1)}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Element Info (read-only) */}
          {action.elementInfo && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <div>Tag: {action.elementInfo.tagName}</div>
              {action.elementInfo.id && <div>ID: {action.elementInfo.id}</div>}
              {action.elementInfo.text && (
                <div className="truncate">Text: {action.elementInfo.text.slice(0, 50)}</div>
              )}
            </div>
          )}

          {/* Timestamp */}
          <div className="text-xs text-muted-foreground">
            Timestamp: {action.timestamp}ms
          </div>
        </div>
      )}
    </div>
  )
}

export default function MacroEditor({ macro, onSave, onClose, error }: MacroEditorProps) {
  const [editedMacro, setEditedMacro] = useState<Macro>({ ...macro, actions: [...macro.actions] })
  const [hasChanges, setHasChanges] = useState(false)

  const updateMacro = (updates: Partial<Macro>) => {
    setEditedMacro((prev) => ({ ...prev, ...updates }))
    setHasChanges(true)
  }

  const updateAction = (index: number, action: MacroAction) => {
    const newActions = [...editedMacro.actions]
    newActions[index] = action
    updateMacro({ actions: newActions })
  }

  const deleteAction = (index: number) => {
    const newActions = editedMacro.actions.filter((_, i) => i !== index)
    updateMacro({ actions: newActions })
  }

  const moveAction = (index: number, direction: 'up' | 'down') => {
    const newActions = [...editedMacro.actions]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    ;[newActions[index], newActions[newIndex]] = [newActions[newIndex], newActions[index]]
    updateMacro({ actions: newActions })
  }

  const addAction = (type: MacroActionType) => {
    const newAction: MacroAction = {
      id: generateId(),
      type,
      timestamp: editedMacro.actions.length > 0
        ? editedMacro.actions[editedMacro.actions.length - 1].timestamp + 100
        : 0,
      selector: '',
      ...(type === 'wait' && { waitDuration: 1000 }),
      ...(type === 'scroll' && { scrollDelta: { deltaX: 0, deltaY: 0 } }),
      ...(type === 'keypress' && {
        keyInfo: { key: '', code: '', modifiers: { ctrl: false, alt: false, shift: false, meta: false } },
      }),
    }
    updateMacro({ actions: [...editedMacro.actions, newAction] })
  }

  const handleSave = () => {
    onSave({ ...editedMacro, updatedAt: Date.now() })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{editedMacro.name}</h2>
            <p className="text-xs text-muted-foreground">
              {editedMacro.actions.length} actions · {editedMacro.startUrl}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-500 mr-2">{error}</span>
          )}
          {hasChanges && !error && (
            <span className="text-xs text-amber-500 mr-2">Unsaved changes</span>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            Save
          </Button>
        </div>
      </div>

      {/* Actions List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {editedMacro.actions.map((action, index) => (
            <ActionEditor
              key={action.id}
              action={action}
              index={index}
              onChange={(updated) => updateAction(index, updated)}
              onDelete={() => deleteAction(index)}
              onMoveUp={() => moveAction(index, 'up')}
              onMoveDown={() => moveAction(index, 'down')}
              isFirst={index === 0}
              isLast={index === editedMacro.actions.length - 1}
            />
          ))}
        </div>

        {editedMacro.actions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No actions yet. Add an action to get started.
          </div>
        )}
      </div>

      {/* Add Action Footer */}
      <div className="border-t border-border p-4 bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground mr-2">Add action:</span>
          {ACTION_TYPES.map((type) => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => addAction(type)}
              className="text-xs"
            >
              + {ACTION_LABELS[type]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
