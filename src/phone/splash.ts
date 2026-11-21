import { GITHUB_MARK } from '../glasses/hud/art'

const LINES = ['GitGlass.', 'GitHub on the move.']
const TYPE_MS = 45
const HOLD_MS = 600

/** Plays the launch animation over the app, then removes itself. */
export function showSplash(): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const overlay = document.createElement('div')
  overlay.className = 'splash'
  overlay.innerHTML = `
    <svg class="splash-mark" viewBox="-1 -1 26 26" aria-hidden="true">
      <path d="${GITHUB_MARK}" pathLength="1" />
    </svg>
    <p class="splash-text" aria-label="${LINES.join(' ')}"><span></span><span></span></p>`
  document.body.append(overlay)

  const spans = overlay.querySelectorAll<HTMLSpanElement>('.splash-text span')
  const close = (): void => {
    overlay.classList.add('splash-done')
    setTimeout(() => overlay.remove(), 300)
  }
  if (reduced) {
    LINES.forEach((line, i) => (spans[i].textContent = line))
    setTimeout(close, HOLD_MS)
    return
  }

  let line = 0
  let char = 0
  const timer = setInterval(() => {
    spans[line].textContent = LINES[line].slice(0, ++char)
    spans.forEach((span, i) => span.classList.toggle('typing', i === line))
    if (char < LINES[line].length) return
    if (++line < LINES.length) {
      char = 0
      return
    }
    clearInterval(timer)
    setTimeout(close, HOLD_MS)
  }, TYPE_MS)
}
