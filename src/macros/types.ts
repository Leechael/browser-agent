import { z } from 'zod'

/**
 * Supported macro action types
 */
export const MacroActionType = z.enum([
  'navigate',
  'click',
  'dblclick',
  'type',
  'keypress',
  'scroll',
  'select',
  'hover',
  'wait',
])
export type MacroActionType = z.infer<typeof MacroActionType>

/**
 * Keyboard modifier keys
 */
export const KeyModifiers = z.object({
  ctrl: z.boolean(),
  alt: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
})
export type KeyModifiers = z.infer<typeof KeyModifiers>

/**
 * Key information for keypress actions
 */
export const KeyInfo = z.object({
  key: z.string(),
  code: z.string(),
  modifiers: KeyModifiers,
})
export type KeyInfo = z.infer<typeof KeyInfo>

/**
 * Coordinates for click/dblclick actions
 */
export const Coordinates = z.object({
  x: z.number(),
  y: z.number(),
})
export type Coordinates = z.infer<typeof Coordinates>

/**
 * Scroll delta for scroll actions
 */
export const ScrollDelta = z.object({
  deltaX: z.number(),
  deltaY: z.number(),
})
export type ScrollDelta = z.infer<typeof ScrollDelta>

/**
 * Element information captured during recording
 */
export const ElementInfo = z.object({
  tagName: z.string(),
  id: z.string().optional(),
  className: z.union([z.string(), z.record(z.unknown())]).optional(),
  text: z.string().optional(),
})
export type ElementInfo = z.infer<typeof ElementInfo>

/**
 * Viewport dimensions
 */
export const Viewport = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})
export type Viewport = z.infer<typeof Viewport>

/**
 * A single macro action
 */
export const MacroAction = z.object({
  id: z.string(),
  type: MacroActionType,
  timestamp: z.number().int().nonnegative(),
  selector: z.string(),
  xpath: z.string().optional(),
  value: z.string().optional(),
  coordinates: Coordinates.optional(),
  scrollDelta: ScrollDelta.optional(),
  keyInfo: KeyInfo.optional(),
  waitDuration: z.number().int().nonnegative().optional(),
  elementInfo: ElementInfo.optional(),
})
export type MacroAction = z.infer<typeof MacroAction>

/**
 * A complete macro definition
 */
export const Macro = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  startUrl: z.string(),
  actions: z.array(MacroAction),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  tags: z.array(z.string()).optional(),
  viewport: Viewport.optional(),
})
export type Macro = z.infer<typeof Macro>

/**
 * Playback options
 */
export const PlaybackOptions = z.object({
  speed: z.number().positive().default(1),
  humanize: z.boolean().default(true),
  stopOnError: z.boolean().default(true),
})
export type PlaybackOptions = z.infer<typeof PlaybackOptions>

/**
 * Playback request body
 */
export const PlaybackRequest = z.object({
  macro: Macro,
  options: PlaybackOptions.optional(),
})
export type PlaybackRequest = z.infer<typeof PlaybackRequest>

/**
 * Error that occurred during playback
 */
export const PlaybackError = z.object({
  actionId: z.string(),
  actionIndex: z.number().int().nonnegative(),
  error: z.string(),
})
export type PlaybackError = z.infer<typeof PlaybackError>

/**
 * Playback result
 */
export const PlaybackResult = z.object({
  success: z.boolean(),
  macroId: z.string(),
  executedActions: z.number().int().nonnegative(),
  totalActions: z.number().int().nonnegative(),
  duration: z.number().int().nonnegative(),
  errors: z.array(PlaybackError).optional(),
})
export type PlaybackResult = z.infer<typeof PlaybackResult>
