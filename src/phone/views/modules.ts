import { createElement } from '../../dom'
import type { ModulePrefs } from '../../types'

export interface ModulesProps {
  prefs: ModulePrefs
  onChange: (prefs: ModulePrefs) => void
  onBack: () => void
}

const MODULES: Array<{ id: keyof ModulePrefs; label: string; desc: string }> = [
  { id: 'feed', label: 'Feed', desc: 'Activity from your repositories' },
  { id: 'pullRequests', label: 'PRs on my repos', desc: 'Open pull requests sent to your repositories' },
  { id: 'notifications', label: 'Notifications', desc: 'Unread and participating notifications' },
  { id: 'issues', label: 'Issues', desc: 'Issues across your repositories' },
  { id: 'explore', label: 'Explore', desc: 'Discover trending repositories' },
  { id: 'myRepositories', label: 'My Repositories', desc: 'Your own repositories' },
  { id: 'contribution', label: 'My PRs', desc: 'Pull requests you opened' },
  { id: 'codeSearch', label: 'Code Search', desc: 'Search code across GitHub' },
  { id: 'actions', label: 'Actions', desc: 'Running and recent workflow runs' },
  { id: 'profile', label: 'My profile', desc: 'Your GitHub profile' },
]

export function renderModules({ prefs, onChange, onBack }: ModulesProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = MODULES.map(m => {
    const checked = prefs[m.id]
    return `
      <div class="module-row" data-id="${m.id}">
        <div class="module-info">
          <div class="module-label">${m.label}</div>
          <div class="module-desc">${m.desc}</div>
        </div>
        <label class="toggle">
          <input type="checkbox" ${checked ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Module Configuration</h1>
    </div>
    <p class="hint">Enable modules to show them in the glasses navigation. Disable to hide.</p>
    <div class="module-list">${rows}</div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.module-row').forEach(row => {
    const id = row.getAttribute('data-id') as keyof ModulePrefs
    const input = row.querySelector('input') as HTMLInputElement
    input.addEventListener('change', () => {
      const next = { ...prefs, [id]: input.checked }
      onChange(next)
    })
  })

  return container
}
