const API_BASE = 'https://api.github.com'
const DEFAULT_TIMEOUT_MS = 30_000

export const REQUIRED_SCOPES = [
  'repo:read',
  'pull_requests:read',
  'issues:read',
  'notifications:read',
  'actions:read',
] as const

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimited: boolean,
  ) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

export interface RateLimit {
  limit: number
  remaining: number
  reset: number // epoch milliseconds
}

export interface PagedResult<T> {
  items: T[]
  nextPage: number | null
}

export class GitHubClient {
  private token: string | null
  private rateLimit: RateLimit | null = null
  private cache = new Map<string, { data: unknown; fetchedAt: number }>()
  private readonly cacheTtlMs: number

  constructor(token: string | null, cacheTtlMs = 5 * 60_000) {
    this.token = token
    this.cacheTtlMs = cacheTtlMs
  }

  setToken(token: string | null): void {
    this.token = token
  }

  clearToken(): void {
    this.token = null
    this.rateLimit = null
    this.cache.clear()
  }

  getRateLimit(): RateLimit | null {
    return this.rateLimit
  }

  private headers(): HeadersInit {
    const h: HeadersInit = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'github-g2-even-hub-plugin',
    }
    if (this.token) {
      h.Authorization = `Bearer ${this.token}`
    }
    return h
  }

  private async fetchJson<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const url = `${API_BASE}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        ...opts,
        headers: { ...this.headers(), ...(opts.headers ?? {}) },
        signal: opts.signal ?? controller.signal,
      })

      const remaining = response.headers.get('X-RateLimit-Remaining')
      const limit = response.headers.get('X-RateLimit-Limit')
      const reset = response.headers.get('X-RateLimit-Reset')
      if (remaining && limit && reset) {
        this.rateLimit = {
          limit: Number(limit),
          remaining: Number(remaining),
          reset: Number(reset) * 1000,
        }
      }

      if (response.status === 401) {
        throw new GitHubApiError('Invalid or expired GitHub token', 401, false)
      }
      if (response.status === 403) {
        const rateLimited = this.rateLimit ? this.rateLimit.remaining === 0 : false
        throw new GitHubApiError(
          rateLimited ? 'GitHub API rate limit exceeded' : 'Insufficient GitHub permissions',
          403,
          rateLimited,
        )
      }
      if (response.status === 404) {
        throw new GitHubApiError('Requested resource not found', 404, false)
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GitHubApiError(
          `GitHub API error (${response.status}): ${text.slice(0, 200)}`,
          response.status,
          false,
        )
      }

      let json: T
      try {
        json = await response.json()
      } catch {
        const text = await response.text().catch(() => '')
        throw new GitHubApiError(
          `Non-JSON response (status ${response.status}): ${text.slice(0, 200)}`,
          response.status,
          false,
        )
      }
      return json
    } catch (err) {
      if (err instanceof GitHubApiError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GitHubApiError('Request timed out', 0, false)
      }
      const msg = err instanceof Error ? err.message : 'Network request failed'
      throw new GitHubApiError(msg, 0, false)
    } finally {
      clearTimeout(timer)
    }
  }

  async get<T>(path: string, useCache = true): Promise<T> {
    const now = Date.now()
    if (useCache) {
      const hit = this.cache.get(path)
      if (hit && now - hit.fetchedAt < this.cacheTtlMs) {
        return hit.data as T
      }
    }
    const data = await this.fetchJson<T>(path)
    this.cache.set(path, { data, fetchedAt: now })
    return data
  }

  /** Fetch one page of results. Returns items and whether a next page exists. */
  async fetchPage<T>(
    path: string,
    page: number,
    perPage = 30,
    opts: FetchOptions = {},
  ): Promise<PagedResult<T>> {
    const separator = path.includes('?') ? '&' : '?'
    const url = `${API_BASE}${path}${separator}per_page=${perPage}&page=${page}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        headers: this.headers(),
        signal: opts.signal ?? controller.signal,
      })

      if (response.status === 401) {
        throw new GitHubApiError('Invalid or expired GitHub token', 401, false)
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new GitHubApiError(
          `GitHub API error (${response.status}): ${text.slice(0, 200)}`,
          response.status,
          false,
        )
      }

      const data = (await response.json()) as T[]
      const link = response.headers.get('Link') ?? ''
      const nextPage = /rel="next"/.test(link) ? page + 1 : null
      return { items: data, nextPage }
    } catch (err) {
      if (err instanceof GitHubApiError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new GitHubApiError('Request timed out', 0, false)
      }
      throw new GitHubApiError(
        err instanceof Error ? err.message : 'Network request failed',
        0,
        false,
      )
    } finally {
      clearTimeout(timer)
    }
  }

  /** Collect up to maxPages of a list endpoint. Bounded so a single gesture
   *  never triggers unbounded requests. */
  async collect<T>(
    path: string,
    opts: { perPage?: number; maxPages?: number } = {},
  ): Promise<T[]> {
    const perPage = opts.perPage ?? 30
    const maxPages = opts.maxPages ?? 5
    const items: T[] = []
    let page = 1
    let next: number | null = page

    while (next !== null && page <= maxPages) {
      const result = await this.fetchPage<T>(path, page, perPage)
      items.push(...result.items)
      next = result.nextPage
      page += 1
    }

    return items
  }
}

interface FetchOptions extends RequestInit {
  signal?: AbortSignal
}
