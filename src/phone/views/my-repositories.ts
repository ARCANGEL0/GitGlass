import { createElement } from '../../dom'
import { formatDate } from './shared'

export interface RepoItem {
  fullName: string
  name: string
  description?: string | null
  language?: string | null
  stars: number
  forks: number
  issues: number
  pullRequests: number
  updatedAt: string
  isPrivate: boolean
}

export interface MyRepositoriesProps {
  repos: RepoItem[]
  onBack: () => void
  onRepo: (repo: RepoItem) => void
}

export function renderMyRepositories({ repos, onBack, onRepo }: MyRepositoriesProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = repos.map(r => `
    <div class="repo-row" data-index="${repos.indexOf(r)}">
      <div class="repo-name">${r.fullName} [${r.isPrivate ? 'private' : 'public'}]</div>
      ${r.description ? `<div class="repo-desc">${r.description}</div>` : ''}
      <div class="repo-meta">
        ${r.language ? `<span class="repo-lang">${r.language}</span>` : ''}
        <span>Stars ${r.stars}</span>
        <span>Forks ${r.forks}</span>
        <span>PRs ${r.pullRequests}</span>
        <span>Issues ${r.issues}</span>
        <span class="repo-updated">Updated ${formatDate(r.updatedAt)}</span>
      </div>
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>My Repositories</h1>
    </div>
    <div class="card">
      ${repos.length === 0
        ? '<p class="hint">No repositories.</p>'
        : `<div class="repo-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.repo-row').forEach((el, i) => {
    el.addEventListener('click', () => onRepo(repos[i]))
  })

  return container
}
