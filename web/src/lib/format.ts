const DATE_FMT = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const DATETIME_FMT = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Melbourne',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** Format epoch ms for UI chrome (e.g. 22/Sep/2026). */
export function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  return DATE_FMT.format(new Date(ms))
}

/** Format epoch ms for UI chrome (e.g. 22/Sep/2026 3:15 pm). */
export function formatDateTime(ms: number | null): string {
  if (ms === null) return '—'
  return DATETIME_FMT.format(new Date(ms))
}

/** Format bytes for file size display. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Convert epoch ms to value for datetime-local input. */
export function msToInputValue(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse datetime-local input to epoch ms. */
export function inputValueToMs(value: string): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** Full-precision log timestamp from ISO-like string. */
export function formatLogTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T'))
  if (Number.isNaN(ms)) return iso
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(ms))
}
