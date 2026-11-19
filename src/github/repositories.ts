import type { GitHubRepository } from '../types'
import { GitHubClient } from './client'

export class RepositoriesService {
  constructor(private client: GitHubClient) {}

  list(opts: { perPage?: number; maxPages?: number } = {}) {
    return this.client.collect<GitHubRepository>('/user/repos?affiliation=owner&sort=updated&direction=desc', {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }

  get(repo: string) {
    return this.client.get<GitHubRepository>(`/repos/${encodeURIComponent(repo)}`)
  }
}
