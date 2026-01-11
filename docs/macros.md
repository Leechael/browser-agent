# Macros

Macros are recorded sequences of user interactions that can be replayed on a headless browser. This document describes the macro system design, data structures, and API.

## Overview

The macro system consists of two parts:

1. **Recording** (Browser Extension) - Captures user interactions in a real browser
2. **Playback** (Server API) - Replays recorded macros on a headless browser via CDP

## Data Structures

### MacroAction

A single action in a macro. Each action represents one user interaction.

```typescript
interface MacroAction {
  id: string                    // Unique identifier
  type: MacroActionType         // Action type
  timestamp: number             // Milliseconds since recording start
  selector: string              // CSS selector for target element
  xpath?: string                // XPath selector (fallback)
  value?: string                // Input value (for type, select, navigate)
  coordinates?: Coordinates     // Click position (for click, dblclick)
  scrollDelta?: ScrollDelta     // Scroll position (for scroll)
  keyInfo?: KeyInfo             // Key details (for keypress)
  waitDuration?: number         // Wait time in ms (for wait)
  elementInfo?: ElementInfo     // Captured element metadata
}
```

### Action Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `navigate` | Navigate to URL | `value` (URL) |
| `click` | Single click | `selector` or `coordinates` |
| `dblclick` | Double click | `selector` or `coordinates` |
| `type` | Type text into input | `selector`, `value` |
| `keypress` | Press a key/shortcut | `keyInfo` |
| `scroll` | Scroll window/element | `selector`, `scrollDelta` |
| `select` | Select dropdown option | `selector`, `value` |
| `hover` | Hover over element | `selector` |
| `wait` | Wait for duration | `waitDuration` |

### KeyInfo

Keyboard event details for `keypress` actions.

```typescript
interface KeyInfo {
  key: string       // Key value (e.g., "Enter", "k")
  code: string      // Physical key code (e.g., "KeyK", "Enter")
  modifiers: {
    ctrl: boolean   // Ctrl/Control key
    alt: boolean    // Alt/Option key
    shift: boolean  // Shift key
    meta: boolean   // Cmd (Mac) / Win (Windows) key
  }
}
```

### Macro

A complete macro definition.

```typescript
interface Macro {
  id: string                    // Unique identifier
  name: string                  // Human-readable name
  description?: string          // Optional description
  startUrl: string              // URL to navigate before playback
  actions: MacroAction[]        // Ordered list of actions
  createdAt: number             // Creation timestamp
  updatedAt: number             // Last update timestamp
  tags?: string[]               // Optional tags for organization
  viewport?: Viewport           // Recorded viewport size
}
```

### Viewport

Browser viewport dimensions.

```typescript
interface Viewport {
  width: number    // Viewport width in pixels
  height: number   // Viewport height in pixels
}
```

## Recording

The browser extension captures user interactions by listening to DOM events:

| Event | Captured As |
|-------|-------------|
| `click` | `click` action with coordinates and selector |
| `dblclick` | `dblclick` action |
| `input` | `type` action (debounced, captures final value) |
| `keydown` | `keypress` action (for shortcuts and special keys) |
| `scroll` | `scroll` action (debounced) |
| `change` | `select` action (for dropdowns) |

### Recording Behavior

1. **Input Handling**: Text input is captured as the final value when:
   - User clicks elsewhere
   - User presses Tab/Enter
   - User navigates away (beforeunload)
   - Input field loses focus (blur)

2. **IME Support**: Composition events are handled to support non-Latin input methods.

3. **Modifier Keys**: Standalone modifier key presses (Ctrl, Alt, Shift, Meta) are not recorded. Only key combinations are captured.

4. **Scroll Debouncing**: Scroll events are debounced (150ms) to capture final scroll position.

## Playback API

### POST /macro/playback

Execute a recorded macro on a headless browser.

#### Request

```typescript
interface PlaybackRequest {
  macro: Macro
  options?: PlaybackOptions
}

interface PlaybackOptions {
  speed?: number       // Playback speed multiplier (default: 1)
  humanize?: boolean   // Add random delays (default: true)
  stopOnError?: boolean // Stop on first error (default: true)
}
```

#### Response

```typescript
interface PlaybackResult {
  success: boolean           // True if all actions succeeded
  macroId: string            // ID of executed macro
  executedActions: number    // Number of actions executed
  totalActions: number       // Total actions in macro
  duration: number           // Total execution time (ms)
  errors?: PlaybackError[]   // Errors if any
}

interface PlaybackError {
  actionId: string      // ID of failed action
  actionIndex: number   // Index in actions array
  error: string         // Error message
}
```

#### Example

```bash
curl -X POST http://localhost:3000/macro/playback \
  -H "Content-Type: application/json" \
  -d '{
    "macro": {
      "id": "abc123",
      "name": "Login Flow",
      "startUrl": "https://example.com/login",
      "actions": [
        {
          "id": "1",
          "type": "type",
          "timestamp": 0,
          "selector": "#username",
          "value": "user@example.com"
        },
        {
          "id": "2",
          "type": "type",
          "timestamp": 1000,
          "selector": "#password",
          "value": "password123"
        },
        {
          "id": "3",
          "type": "click",
          "timestamp": 2000,
          "selector": "button[type=submit]",
          "coordinates": { "x": 200, "y": 300 }
        }
      ],
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000
    },
    "options": {
      "speed": 1,
      "humanize": true,
      "stopOnError": true
    }
  }'
```

## Playback Execution

The server executes actions using Chrome DevTools Protocol (CDP):

| Action | CDP Method |
|--------|------------|
| `navigate` | `Page.navigate` |
| `click` | `Input.dispatchMouseEvent` |
| `dblclick` | `Input.dispatchMouseEvent` (2x) |
| `type` | `Input.dispatchKeyEvent` (per character) |
| `keypress` | `Input.dispatchKeyEvent` |
| `scroll` | `Runtime.evaluate` (window.scrollTo) |
| `select` | `Runtime.evaluate` (set value) |
| `wait` | setTimeout |

### Stability Handling

After each action, a short delay (500ms) allows the page to settle:
- Navigation waits for `loadEventFired`
- Clicks wait for async updates
- Type waits for autocomplete/search
- Key shortcuts wait for UI changes

## File Structure

```
src/macros/
├── index.ts     # API endpoint (Hono router)
├── types.ts     # Zod schemas and TypeScript types
└── runner.ts    # Playback execution logic
```

## Validation

All request data is validated using Zod schemas:

- `Macro` - Validates complete macro structure
- `MacroAction` - Validates individual actions
- `PlaybackOptions` - Validates playback options
- `PlaybackRequest` - Validates API request body

Invalid requests return 400 with validation error details.
