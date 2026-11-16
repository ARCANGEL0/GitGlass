/* Tiny DOM helper — create elements with attributes and children. */

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; [key: string]: unknown } = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (props.className) el.className = props.className
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') continue
    ;(el as Record<string, unknown>)[key] = value
  }
  return el
}

export function html(root: HTMLElement, template: string): void {
  root.innerHTML = template
}
