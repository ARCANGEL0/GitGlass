import type { GitHubIssue } from '../types'
import { GitHubClient } from './client'

interface IssueSearchItem {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  user?: { login: string }
  repository?: { full_name: string }
  repository_url?: string
  labels?: Array<{ name: string }>
  assignee?: { login: string } | null
  created_at?: string
  updated_at?: string
  html_url?: string
}

export class IssuesService {
  constructor(private client: GitHubClient) {}

  list(opts: { perPage?: number; maxPages?: number; filter?: string } = {}) {
    const path = opts.filter
      ? `/issues?filter=${opts.filter}&per_page=${opts.perPage ?? 30}&page=1`
      : `/issues?per_page=${opts.perPage ?? 30}&page=1`
    return this.client.collect<GitHubIssue>(path, {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }

  listForRepo(repo: string, opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubIssue>(
      `/repos/${encodeURIComponent(repo)}/issues`,
      { perPage: opts.perPage ?? 30, maxPages: opts.maxPages ?? 3 },
    )
  }

  async listForMyRepositories(login: string, opts: { perPage?: number; maxPages?: number } = {}) {
    const perPage = opts.perPage ?? 30
    const maxPages = opts.maxPages ?? 3
    const query = encodeURIComponent(`is:issue state:open archived:false user:${login} sort:updated-desc`)
    const items: IssueSearchItem[] = []
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await this.client.get<{ items?: IssueSearchItem[]; total_count?: number }>(
        `/search/issues?q=${query}&per_page=${perPage}&page=${page}`,
        false,
      )
      const pageItems = result.items ?? []
      items.push(...pageItems)
      if (pageItems.length < perPage || items.length >= (result.total_count ?? items.length)) break
    }
    return items
  }

  get(repo: string, number: number) {
    return this.client.get<GitHubIssue>(
      `/repos/${encodeURIComponent(repo)}/issues/${number}`,
    )
  }
}
