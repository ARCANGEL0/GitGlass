import { GitHubClient } from './client'

export interface SearchResult {
  total_count: number
  items: Array<{
    name: string
    full_name?: string
    html_url: string
    owner?: { login: string }
    description?: string | null
    language?: string | null
    stargazers_count?: number
    forks_count?: number
    created_at?: string
    updated_at?: string
    open_issues_count?: number
  }>
}

export class SearchService {
  constructor(private client: GitHubClient) {}

  repositories(query: string, opts: { perPage?: number; maxPages?: number } = {}) {
    const q = encodeURIComponent(query)
    return this.client.collect<SearchResult['items'][0]>(
      `/search/repositories?q=${q}&per_page=${opts.perPage ?? 30}&page=1`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }

  issues(query: string, opts: { perPage?: number; maxPages?: number } = {}) {
    const q = encodeURIComponent(query)
    return this.client.collect<SearchResult['items'][0]>(
      `/search/issues?q=${q}&per_page=${opts.perPage ?? 30}&page=1`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }

  async trending(days = 7, count = 30) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    const q = encodeURIComponent(`created:>${since}`)
    const result = await this.client.get<SearchResult>(
      `/search/repositories?q=${q}&sort=stars&order=desc&per_page=${count}`,
    )
    return result.items ?? []
  }
}
