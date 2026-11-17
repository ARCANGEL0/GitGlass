/* Phone settings view.

Display preferences and app settings.
*/

import { createElement } from '../../dom'
import type { DisplayPrefs } from '../../types'

export interface SettingsProps {
  display: DisplayPrefs
  onChange: (display: DisplayPrefs) => void
  onBack: () => void
}

export function renderSettings({ display, onChange, onBack }: SettingsProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Settings</h1>
    </div>

    <div class="card">
      <h3>Display</h3>
      <div class="field">
        <label class="toggle-label">
          <input type="checkbox" ${display.compact ? 'checked' : ''} />
          Compact list view on glasses
        </label>
      </div>
      <div class="field">
        <label class="toggle-label">
          <input type="checkbox" ${display.showBadges ? 'checked' : ''} />
          Show status badges
        </label>
      </div>
    </div>
  `

  const back = container.querySelector('#back-btn')!
  back.addEventListener('click', onBack)

  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      const next: DisplayPrefs = {
        compact: (container.querySelector('input:nth-of-type(1)') as HTMLInputElement).checked,
        showBadges: (container.querySelector('input:nth-of-type(2)') as HTMLInputElement).checked,
      }
      onChange(next)
    })
  })

  return container
}
