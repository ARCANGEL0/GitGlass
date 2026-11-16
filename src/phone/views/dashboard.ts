/* Phone connected dashboard.

Shows the authenticated user's profile summary and navigation to every module.
Each module card is clickable and opens the full module view.
*/

import { createElement } from '../../dom'

export interface DashboardProps {
  user: { login: string; name?: string | null; avatar?: string | null; public_repos: number }
  onOpenModule: (module: string) => void
  onModules: () => void
  onSettings: () => void
  onDisconnect: () => void
}

const MODULE_CARDS = [
  { id: 'feed', label: 'Feed', desc: 'Activity, stars, forks, followers' },
  { id: 'pullRequests', label: 'My PRs', desc: 'PRs you submitted — open the full thread' },
  { id: 'notifications', label: 'Notifications', desc: 'Unread and participating' },
  { id: 'issues', label: 'Issues', desc: 'Issues on your repositories' },
  { id: 'collabPrs', label: 'Collab PRs', desc: 'PRs others made on your repos' },
  { id: 'explore', label: 'Trending', desc: 'Trending repositories with details' },
  { id: 'myRepositories', label: 'My Repositories', desc: 'Browse your repos and their contents' },
  { id: 'codeSearch', label: 'Code Search', desc: 'Search code across GitHub' },
  { id: 'actions', label: 'Actions', desc: 'Workflow runs' },
  { id: 'profile', label: 'Profile', desc: 'Your GitHub profile' },
]

export function renderDashboard({
  user,
  onOpenModule,
  onModules,
  onSettings,
  onDisconnect,
}: DashboardProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const cards = MODULE_CARDS.map(c => `
    <button class="module-card" data-module="${c.id}">
      <div class="module-card-label">${c.label}</div>
      <div class="module-card-desc">${c.desc}</div>
    </button>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
    </div>

    <div class="profile-card">
      <img class="avatar" src="${user.avatar ?? ''}" alt="" />
      <div class="profile-info">
        <div class="name">${user.name ?? user.login}</div>
        <div class="login">@${user.login}</div>
        <div class="repos">${user.public_repos} public repositories</div>
      </div>
    </div>

    <div class="module-grid">
      ${cards}
    </div>

    <div class="card">
      <h3>Configuration</h3>
      <button class="btn btn-block" id="modules-btn">Module Configuration</button>
      <button class="btn btn-block" id="settings-btn">Settings</button>
    </div>

    <div class="card danger">
      <h3>Account</h3>
      <button class="btn btn-danger" id="disconnect-btn">Disconnect GitHub</button>
    </div>
  `

  container.querySelectorAll('.module-card').forEach(card => {
    card.addEventListener('click', () => {
      const module = card.getAttribute('data-module')!
      onOpenModule(module)
    })
  })
  container.querySelector('#modules-btn')!.addEventListener('click', onModules)
  container.querySelector('#settings-btn')!.addEventListener('click', onSettings)
  container.querySelector('#disconnect-btn')!.addEventListener('click', onDisconnect)

  return container
}
