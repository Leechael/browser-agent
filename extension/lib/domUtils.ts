/**
 * Generate a unique CSS selector for an element
 */
export function generateSelector(element: Element): string {
  // 1. If element has a unique ID, use it directly
  if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
    return `#${CSS.escape(element.id)}`
  }

  // 2. Try using data-testid (commonly used for testing)
  const testId = element.getAttribute('data-testid')
  if (testId && document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`).length === 1) {
    return `[data-testid="${CSS.escape(testId)}"]`
  }

  // 3. Try using aria-label
  const ariaLabel = element.getAttribute('aria-label')
  if (ariaLabel && document.querySelectorAll(`[aria-label="${CSS.escape(ariaLabel)}"]`).length === 1) {
    return `[aria-label="${CSS.escape(ariaLabel)}"]`
  }

  // 4. Try using name attribute (for form elements)
  const name = element.getAttribute('name')
  if (name && document.querySelectorAll(`[name="${CSS.escape(name)}"]`).length === 1) {
    return `[name="${CSS.escape(name)}"]`
  }

  // 5. Build a path-based selector
  return buildPathSelector(element)
}

function buildPathSelector(element: Element): string {
  const path: string[] = []
  let current: Element | null = element

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()

    // Add class names (max 2 meaningful classes)
    if (current.classList.length > 0) {
      const meaningfulClasses = Array.from(current.classList)
        .filter((cls) => !cls.match(/^[a-z]{1,2}\d+$/)) // Filter out meaningless class names like "c3"
        .slice(0, 2)

      if (meaningfulClasses.length > 0) {
        selector += '.' + meaningfulClasses.map((c) => CSS.escape(c)).join('.')
      }
    }

    // Add nth-of-type if needed
    const parent: Element | null = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child: Element) => child.tagName === current!.tagName
      )

      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    path.unshift(selector)

    // Check if the current selector is already unique
    const fullSelector = path.join(' > ')
    if (document.querySelectorAll(fullSelector).length === 1) {
      return fullSelector
    }

    current = parent
  }

  return path.join(' > ')
}

/**
 * Escape a string for use in XPath expressions
 */
function escapeXPathString(str: string): string {
  // If string contains no quotes, use double quotes
  if (!str.includes('"')) {
    return `"${str}"`
  }
  // If string contains no single quotes, use single quotes
  if (!str.includes("'")) {
    return `'${str}'`
  }
  // If string contains both, use concat()
  const parts = str.split('"').map((part, i) => (i === 0 ? `"${part}"` : `'"',"${part}"`))
  return `concat(${parts.join(',')})`
}

/**
 * Generate an XPath for an element
 */
export function generateXPath(element: Element): string {
  // If element has an ID, use it directly
  if (element.id) {
    return `//*[@id=${escapeXPathString(element.id)}]`
  }

  const paths: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1
    let sibling: Element | null = current.previousElementSibling

    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index++
      }
      sibling = sibling.previousElementSibling
    }

    const tagName = current.tagName.toLowerCase()
    const pathPart = index > 1 ? `${tagName}[${index}]` : tagName
    paths.unshift(pathPart)

    current = current.parentElement
  }

  return '/' + paths.join('/')
}

/**
 * Validate if a selector is valid and unique
 */
export function validateSelector(selector: string): { valid: boolean; count: number } {
  try {
    const elements = document.querySelectorAll(selector)
    return {
      valid: true,
      count: elements.length,
    }
  } catch {
    return {
      valid: false,
      count: 0,
    }
  }
}

/**
 * Get element information
 */
export function getElementInfo(element: Element): {
  tagName: string
  id?: string
  className?: string
  text?: string
} {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: element.className || undefined,
    text: element.textContent?.slice(0, 50) || undefined,
  }
}
