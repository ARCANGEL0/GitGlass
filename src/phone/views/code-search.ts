import { createElement } from '../../dom'

export interface SearchResultItem {
  type: 'repository' | 'issue' | 'pull_request' | 'user' | 'code'
  name: string
  fullName?: string
  owner?: string
  description?: string | null
  url: string
}

export interface CodeSearchProps {
  results: SearchResultItem[]
  query: string
  onBack: () => void
  onResult: (result: SearchResultItem) => void
}

export function renderCodeSearch({ results, query, onBack, onResult }: CodeSearchProps): HTMLElement {
  const container = createElement('div', { className: 'phone-page' })

  const rows = results.map(r => `
    <div class="search-row" data-index="${results.indexOf(r)}">
      <div class="search-type">${r.type}</div>
      <div class="search-name">${r.name}</div>
      ${r.fullName ? `<div class="search-fullname">${r.fullName}</div>` : ''}
      ${r.owner ? `<div class="search-owner">@${r.owner}</div>` : ''}
      ${r.description ? `<div class="search-desc">${r.description}</div>` : ''}
    </div>
  `).join('')

  container.innerHTML = `
    <div class="page-header">
      <button class="btn btn-back" id="back-btn">Back</button>
      <h1>Code Search</h1>
    </div>
    <div class="card">
      <div class="search-query">Query: "${query}"</div>
      ${results.length === 0
        ? '<p class="hint">No results.</p>'
        : `<div class="search-list">${rows}</div>`}
    </div>
  `

  container.querySelector('#back-btn')!.addEventListener('click', onBack)

  container.querySelectorAll('.search-row').forEach((el, i) => {
    el.addEventListener('click', () => onResult(results[i]))
  })

  return container
}
