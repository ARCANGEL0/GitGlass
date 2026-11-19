import { GitHubClient } from './client'

export interface ActivityFeedPage {
  events: any[]
  hasMore: boolean
}

interface OwnedActivity {
  repositories: Map<string, any>
  events: any[]
}

const RECEIVED_EVENTS_PER_PAGE = 30
const OWNED_EVENTS_PER_PAGE = 15

export class ActivityService {
  private ownedActivity = new Map<string, OwnedActivity>()
  private followedUsers = new Map<string, Set<string>>()

  constructor(private client: GitHubClient) {}

  async forFeed(login: string): Promise<any[]> {
    const page = await this.forFeedPage(login, 1)
    return page.events
  }

  async forFeedPage(login: string, page: number): Promise<ActivityFeedPage> {
    const [owned, followedUsers] = await Promise.all([
      this.loadOwnedActivity(login),
      this.loadFollowedUsers(login),
    ])
    const received = await this.client.fetchPage<any>(
      `/users/${encodeURIComponent(login)}/received_events`,
      page,
      RECEIVED_EVENTS_PER_PAGE,
    )
    const ownedEvents = owned.events.slice(
      (page - 1) * OWNED_EVENTS_PER_PAGE,
      page * OWNED_EVENTS_PER_PAGE,
    ).filter(event => !this.isHiddenEvent(event, login))
    const receivedEvents = received.items.filter(event => {
      if (this.isHiddenEvent(event, login)) return false
      const actor = String(event.actor?.login ?? event.actor?.display_login ?? '').toLowerCase()
      const repoName = String(event.repo?.name ?? '').toLowerCase()
      return followedUsers.has(actor) || owned.repositories.has(repoName)
    })
    const candidates = [...ownedEvents, ...receivedEvents]
    const seen = new Set<string>()
    const events = candidates
      .filter(event => {
        const key = String(event.id ?? `${event.type}:${event.repo?.name}:${event.created_at}`)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(event => {
        const repoName = String(event.repo?.name ?? '').toLowerCase()
        const repository = owned.repositories.get(repoName)
        return {
          ...event,
          isOwnedRepository: Boolean(repository),
          repositoryDescription: repository?.description ?? '',
        }
      })
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

    return {
      events,
      hasMore: received.nextPage !== null || owned.events.length > page * OWNED_EVENTS_PER_PAGE,
    }
  }

  private async loadOwnedActivity(login: string): Promise<OwnedActivity> {
    const cached = this.ownedActivity.get(login.toLowerCase())
    if (cached) return cached

    const repos = await this.client
      .collect<any>('/user/repos?affiliation=owner&sort=updated&direction=desc', { perPage: 100, maxPages: 1 })
      .catch(() => [] as any[])
    const ownedRepos = repos
      .filter(repo => repo.owner?.login?.toLowerCase() === login.toLowerCase())
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
    const selected = ownedRepos.slice(0, 12)
    const batches = await Promise.all(selected.map(repo => (
      this.client
        .collect<any>(`/repos/${this.repoPath(repo.full_name)}/events`, { perPage: 10, maxPages: 1 })
        .catch(() => [] as any[])
    )))
    const data = {
      repositories: new Map(ownedRepos.map(repo => [String(repo.full_name).toLowerCase(), repo])),
      events: batches.flat().sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))),
    }
    this.ownedActivity.set(login.toLowerCase(), data)
    return data
  }

  private isHiddenEvent(event: any, login: string): boolean {
    const actor = String(event.actor?.login ?? event.actor?.display_login ?? '').toLowerCase()
    return actor === login.toLowerCase() || actor === 'github-actions' || actor === 'github-actions[bot]'
  }

  private async loadFollowedUsers(login: string): Promise<Set<string>> {
    const key = login.toLowerCase()
    const cached = this.followedUsers.get(key)
    if (cached) return cached

    const users = await this.client
      .collect<any>(`/users/${encodeURIComponent(login)}/following`, { perPage: 100, maxPages: 10 })
      .catch(() => [] as any[])
    const followed = new Set(users.map(user => String(user.login ?? '').toLowerCase()).filter(Boolean))
    this.followedUsers.set(key, followed)
    return followed
  }

  private repoPath(repo: string): string {
    return repo.split('/').map(part => encodeURIComponent(part)).join('/')
  }
}
