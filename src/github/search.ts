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
}
