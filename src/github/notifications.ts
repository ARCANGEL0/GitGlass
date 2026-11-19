import type { GitHubNotification } from '../types'
import { GitHubClient } from './client'

export class NotificationsService {
  constructor(private client: GitHubClient) {}

  list(opts: { perPage?: number; maxPages?: number; participating?: boolean } = {}) {
    const qs = [
      `per_page=${opts.perPage ?? 30}`,
      'page=1',
      opts.participating ? 'participating=true' : '',
    ]
      .filter(Boolean)
      .join('&')
    return this.client.collect<GitHubNotification>(`/notifications?${qs}`, {
      perPage: opts.perPage ?? 30,
      maxPages: opts.maxPages ?? 3,
    })
  }
}
