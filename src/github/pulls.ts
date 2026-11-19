import { GitHubClient } from './client'
import type { GitHubPullRequest } from '../types'

interface PullRequestSearchItem {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  user?: { login: string }
  repository_url?: string
  html_url?: string
  created_at?: string
  updated_at?: string
  pull_request?: { merged_at?: string | null }
}

export class PullRequestsService {
  constructor(private client: GitHubClient) {}

  private async search(queryText: string, opts: { perPage?: number; maxPages?: number } = {}) {
    const perPage = opts.perPage ?? 30
    const maxPages = opts.maxPages ?? 3
    const query = encodeURIComponent(queryText)
    const items: PullRequestSearchItem[] = []
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await this.client.get<{ items?: PullRequestSearchItem[]; total_count?: number }>(
        `/search/issues?q=${query}&sort=updated&order=desc&per_page=${perPage}&page=${page}`,
        false,
      )
      const pageItems = result.items ?? []
      items.push(...pageItems)
      if (pageItems.length < perPage || items.length >= (result.total_count ?? items.length)) break
    }
    return items
  }

  async createdByMe(login: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.search(`is:pr archived:false author:${login} sort:updated-desc`, opts)
  }

  async onMyRepositories(login: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.search(`is:pr -author:${login} state:open archived:false sort:updated-desc user:${login}`, opts)
  }

  listForRepo(repo: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubPullRequest>(
      `/repos/${repo.split('/').map(part => encodeURIComponent(part)).join('/')}/pulls`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }

  get(repo: string, number: number) {
    return this.client.get<GitHubPullRequest>(
      `/repos/${repo.split('/').map(part => encodeURIComponent(part)).join('/')}/pulls/${number}`,
    )
  }
}
