export interface FileInfo {
  path: string
  size: number
  format: string
  firstTime: number | null
  lastTime: number | null
  firstOffset: number
  lastOffset: number
}

export interface SearchFilters {
  path: string
  timeStart?: number | null
  timeEnd?: number | null
  phrase?: string
  excludePhrase?: string
  regex?: string
  regexFlags?: string
  caseSensitive?: boolean
  levels?: string[]
  channel?: string
  cursor?: number
  limit?: number
}

export interface SearchEntry {
  type: 'entry'
  offset: number
  length: number
  time: number | null
  level: string
  channel: string
  message: string
  truncated: boolean
}

export interface SearchMeta {
  type: 'meta'
  scanStart: number
  scanEnd: number
  mode: 'content' | 'metadata'
  pageSize: number
}

export interface SearchDone {
  type: 'done'
  nextCursor: number | null
  hasMore: boolean
  count: number
}

export interface SearchError {
  type: 'error'
  message: string
}

export type SearchEvent = SearchMeta | SearchEntry | SearchDone | SearchError

export interface EntryBody {
  body: string
  truncated: boolean
}

export interface NeighborEntry {
  offset: number
  length: number
  time: number | null
  level: string
  channel: string
  message: string
  body: string
  truncated: boolean
}

export interface NeighborBatch {
  entries: NeighborEntry[]
  hasMore: boolean
}

export interface NeighborsResponse {
  above?: NeighborBatch
  below?: NeighborBatch
}

const TOKEN_STORAGE_KEY = 'peeker-token'

function rememberToken(token: string): string {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
  return token
}

function getToken(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('token')
  if (fromUrl) return rememberToken(fromUrl)

  const fromStorage = sessionStorage.getItem(TOKEN_STORAGE_KEY)
  if (fromStorage) return fromStorage

  const fromEnv = import.meta.env.VITE_PEEKER_TOKEN
  if (fromEnv) return rememberToken(fromEnv)

  throw new Error(
    'Missing token. Use the URL printed by npm run dev (includes ?token=…), or run npm start.',
  )
}

function apiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-peeker-token': getToken(),
  }
}

function withToken(path: string): string {
  return `${path}?token=${encodeURIComponent(getToken())}`
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export async function openFile(path: string): Promise<FileInfo> {
  const res = await fetch(withToken('/api/open'), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<FileInfo>
}

export async function fetchNeighbors(
  path: string,
  opts: { beforeOffset?: number; afterOffset?: number; count?: number },
): Promise<NeighborsResponse> {
  const res = await fetch(withToken('/api/neighbors'), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ path, ...opts }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<NeighborsResponse>
}

export async function fetchEntry(path: string, offset: number, length: number): Promise<EntryBody> {
  const params = new URLSearchParams({
    path,
    offset: String(offset),
    length: String(length),
    token: getToken(),
  })
  const res = await fetch(`/api/entry?${params}`)
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EntryBody>
}

export async function countMatches(filters: SearchFilters, signal?: AbortSignal): Promise<number | null> {
  const res = await fetch(withToken('/api/count'), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(filters),
    signal,
  })
  if (!res.ok) return null
  const data = (await res.json()) as { count: number | null }
  return data.count
}

/** Stream NDJSON search results incrementally. */
export async function* streamSearch(
  filters: SearchFilters,
  signal?: AbortSignal,
): AsyncGenerator<SearchEvent> {
  const res = await fetch(withToken('/api/search'), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(filters),
    signal,
  })
  if (!res.ok) throw new Error(await parseError(res))
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield JSON.parse(line) as SearchEvent
    }
  }

  const tail = buffer.trim()
  if (tail) yield JSON.parse(tail) as SearchEvent
}
