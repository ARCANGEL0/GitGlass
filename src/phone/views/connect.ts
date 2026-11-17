/* Phone GitHub connection view.

Token input with show/hide, validation feedback, error display, and a debug
option that shows detailed error information.
*/

import { createElement } from '../../dom'

export interface ConnectProps {
  onSubmit: (token: string) => void
  onBack: () => void
  validating?: boolean
  error?: string | null
  token?: string | null
  debug?: boolean
  onDebug?: () => void
}

export function renderConnect({
  onSubmit,
  onBack,
  validating = false,
  error,
  token,
  debug = false,
  onDebug,
}: ConnectProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Connect GitHub</h1>
    </div>

    <div class="card">
      <p class="hint">Paste a fine-grained Personal Access Token with read-only access to repositories, pull requests, issues, and notifications.</p>

      <div class="field">
        <label>Personal Access Token</label>
        <div class="input-wrap">
          <input type="password" id="token-input" placeholder="ghp_…" value="${token ?? ''}" />
          <button type="button" class="btn btn-toggle" id="toggle-visibility">Show</button>
        </div>
      </div>

      ${error ? `<p class="error">${error}</p>` : ''}
      ${debug ? `<p class="debug">Debug mode: errors will be shown in detail.</p>` : ''}
    </div>

    <button class="btn btn-primary" id="submit-btn"${validating ? ' disabled' : ''}>
      ${validating ? 'Validating…' : 'Connect'}
    </button>
    <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
    ${debug ? `<button class="btn btn-secondary" id="debug-btn">Debug</button>` : ''}
  `

  const toggle = container.querySelector('#toggle-visibility')!
  const input = container.querySelector('#token-input') as HTMLInputElement
  let showing = false
  toggle.addEventListener('click', () => {
    showing = !showing
    input.type = showing ? 'text' : 'password'
    toggle.textContent = showing ? 'Hide' : 'Show'
  })

  const back = container.querySelector('#back-btn')!
  back.addEventListener('click', onBack)

  const submit = container.querySelector('#submit-btn')!
  submit.addEventListener('click', () => {
    const token = input.value.trim()
    if (!token) return
    onSubmit(token)
  })

  if (debug) {
    const debugBtn = container.querySelector('#debug-btn')!
    debugBtn.addEventListener('click', () => {
      onDebug?.()
    })
  }

  return container
}
