// Development only: a GitHub client that answers from fixtures, so the HUD can
// be driven in the simulator without a real token. main.ts imports this file
// dynamically behind import.meta.env.DEV, so it never reaches a build.

import { GitHubClient } from '../github/client'

const LOGIN = 'octo-dev'

const repos = [
  { full_name: `${LOGIN}/g2git`, name: 'g2git', private: false, stargazers_count: 412, forks_count: 31, open_issues_count: 7, updated_at: new Date(Date.now() - 3600e3).toISOString(), language: 'TypeScript' },
  { full_name: `${LOGIN}/hud-kit`, name: 'hud-kit', private: false, stargazers_count: 1288, forks_count: 96, open_issues_count: 12, updated_at: new Date(Date.now() - 86400e3).toISOString(), language: 'TypeScript' },
  { full_name: `${LOGIN}/dotfiles`, name: 'dotfiles', private: true, stargazers_count: 3, forks_count: 0, open_issues_count: 0, updated_at: new Date(Date.now() - 5 * 86400e3).toISOString(), language: 'Shell' },
]

const prItems = [
  { number: 142, title: 'Draw HUD frames as image tiles', state: 'open', user: { login: 'kiko' }, repository_url: `/repos/${LOGIN}/g2git`, updated_at: new Date(Date.now() - 600e3).toISOString() },
  { number: 139, title: 'Gate swipes so one gesture moves one row', state: 'open', user: { login: 'rook' }, repository_url: `/repos/${LOGIN}/g2git`, updated_at: new Date(Date.now() - 7200e3).toISOString() },
  { number: 57, title: 'Add bevelled card component', state: 'closed', pull_request: { merged_at: '2026-11-01' }, user: { login: 'marrow' }, repository_url: `/repos/${LOGIN}/hud-kit`, updated_at: new Date(Date.now() - 86400e3).toISOString() },
  { number: 51, title: 'Quantize text to 16 grey levels', state: 'open', user: { login: 'lumen' }, repository_url: `/repos/${LOGIN}/hud-kit`, updated_at: new Date(Date.now() - 3 * 86400e3).toISOString() },
]

const issueItems = [
  { number: 88, title: 'Gauge arc clips at 100%', state: 'open', user: { login: 'kiko' }, repository_url: `/repos/${LOGIN}/hud-kit`, updated_at: new Date(Date.now() - 1800e3).toISOString() },
  { number: 86, title: 'Token lost after app restart', state: 'open', user: { login: 'rook' }, repository_url: `/repos/${LOGIN}/g2git`, updated_at: new Date(Date.now() - 9000e3).toISOString() },
]

const counts: Array<[RegExp, number]> = [
  [/is:merged/, 214],
  [/is:open author:/, 6],
  [/is:pr author:/, 268],
  [/-author:/, 4],
  [/is:issue/, 19],
]

export class DemoClient extends GitHubClient {
  constructor() {
    super('demo')
  }

  async graphql<T>(): Promise<T> {
    // A repeatable year of activity: quieter weekends, a few busy streaks.
    let seed = 7
    const next = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
    const weeks = Array.from({ length: 52 }, (_, w) => ({
      contributionDays: Array.from({ length: 7 }, (_, d) => {
        const busy = w > 30 && w < 38 ? 2 : 1
        const weekday = d > 0 && d < 6 ? 1 : 0.35
        const roll = next()
        return { contributionCount: roll < 0.28 ? 0 : Math.round(roll * 9 * busy * weekday) }
      }),
    }))
    return { viewer: { contributionsCollection: { contributionCalendar: { totalContributions: 1313, weeks } } } } as T
  }

  async get<T>(path: string): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, 150))
    if (path === '/user') {
      return { login: LOGIN, name: 'Octo Dev', public_repos: 48, total_private_repos: 9, followers: 2548, following: 31, bio: 'Building HUDs.' } as T
    }
    if (path.startsWith('/notifications')) {
      return [
        { id: '1', unread: true, reason: 'review_requested', subject: { title: 'Draw HUD frames as image tiles', type: 'PullRequest' }, repository: { full_name: `${LOGIN}/g2git` } },
        { id: '2', unread: true, reason: 'mention', subject: { title: 'Gauge arc clips at 100%', type: 'Issue' }, repository: { full_name: `${LOGIN}/hud-kit` } },
        { id: '3', unread: true, reason: 'author', subject: { title: 'Release v1.4.0', type: 'Release' }, repository: { full_name: `${LOGIN}/hud-kit` } },
      ] as T
    }
    if (path.startsWith('/search/issues')) {
      const query = decodeURIComponent(path.split('q=')[1]?.split('&')[0] ?? '')
      if (path.includes('per_page=1&') || path.endsWith('per_page=1')) {
        return { total_count: counts.find(([re]) => re.test(query))?.[1] ?? 0 } as T
      }
      return { items: query.includes('is:issue') ? issueItems : prItems } as T
    }
    const pull = path.match(/\/repos\/(.+)\/pulls\/(\d+)$/)
    if (pull) {
      return {
        number: Number(pull[2]), title: 'Draw HUD frames as image tiles', state: 'open', draft: false,
        user: { login: 'kiko' }, head: { ref: 'hud-tiles' }, base: { ref: 'main' }, additions: 412, deletions: 96, changed_files: 9,
        body: 'Text containers can only draw a plain rectangle, so the frame is drawn on a canvas and sent as four tiles. Text stays in firmware containers on top, so moving the cursor is instant.',
      } as T
    }
    return [] as T
  }

  async collect<T>(path: string): Promise<T[]> {
    await new Promise(resolve => setTimeout(resolve, 150))
    if (path.startsWith('/user/repos')) return repos as T[]
    if (path.endsWith('/comments')) return [{ user: { login: 'rook' }, body: 'Looks great on glass. Can the hint row go one level dimmer?' }] as T[]
    if (path.endsWith('/reviews')) return [{ user: { login: 'marrow' }, state: 'APPROVED' }] as T[]
    if (path.endsWith('/files')) return [{ status: 'added', filename: 'src/glasses/hud/pages.ts', additions: 260, deletions: 0, patch: '@@ -0,0 +1,12 @@\n+export function drawCard(p: Pixels) {\n+  p.path(outline, BRIGHT, 2)\n+}' }] as T[]
    return [] as T[]
  }
}

export const DEMO_LOGIN = LOGIN
