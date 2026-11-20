export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return `Today · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)}`
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export type PrStatus = 'open' | 'closed' | 'merged'

const PR_STATUS_PATHS: Record<PrStatus, string> = {
  merged: '<path d="M3 8.5l3.2 3.2L13 4.8"/>',
  closed: '<path d="M4 4l8 8M12 4l-8 8"/>',
  open: '<circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="12" cy="12.5" r="1.7"/><path d="M4 5.2v5.6M12 10.8V6.5a2 2 0 0 0-2-2H7.5M9 3l-1.5 1.5L9 6"/>',
}

const PR_STATUS_LABELS: Record<PrStatus, string> = {
  merged: 'Merged',
  closed: 'Closed',
  open: 'Open',
}

export function prStatusIcon(status: PrStatus): string {
  return `<svg class="pr-status pr-status--${status}" viewBox="0 0 16 16" role="img" aria-label="${PR_STATUS_LABELS[status]}"><title>${PR_STATUS_LABELS[status]}</title>${PR_STATUS_PATHS[status]}</svg>`
}

const RUN_STATUS: Record<'running' | 'success' | 'skipped' | 'failed', { label: string; paths: string }> = {
  running: { label: 'Running', paths: '<circle cx="8" cy="8" r="5.5"/><path d="M8 4.8V8l2.2 1.4"/>' },
  success: { label: 'Succeeded', paths: PR_STATUS_PATHS.merged },
  skipped: { label: 'Skipped', paths: '<circle cx="8" cy="8" r="5.5"/><path d="M5 11l6-6"/>' },
  failed: { label: 'Failed', paths: PR_STATUS_PATHS.closed },
}

export function runStatusIcon(status: string, conclusion: string | null): string {
  const kind = status !== 'completed' ? 'running'
    : conclusion === 'success' ? 'success'
    : conclusion === 'skipped' || conclusion === 'neutral' ? 'skipped'
    : 'failed'
  const { label, paths } = RUN_STATUS[kind]
  return `<svg class="pr-status run-status--${kind}" viewBox="0 0 16 16" role="img" aria-label="${label}"><title>${label}</title>${paths}</svg>`
}
