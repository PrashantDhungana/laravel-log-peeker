export interface FileInfo {
  path: string
  size: number
  format: string
  firstTime: number | null
  lastTime: number | null
  firstOffset: number
  lastOffset: number
}

export interface OpenSummary {
  fileCount: number
  totalSize: number
  firstTime: number | null
  lastTime: number | null
}

export interface OpenFilesResponse {
  files: FileInfo[]
  summary: OpenSummary
}

export interface FacetCount {
  name: string
  count: number
}

export interface FileFacets {
  levels: FacetCount[]
  channels: FacetCount[]
  entryCount: number
}

export interface SearchCursor {
  byPath: Record<string, number>
  buffer?: SearchEntry[]
}

export interface SearchFilters {
  path?: string
  paths?: string[]
  timeStart?: number | null
  timeEnd?: number | null
  phrase?: string
  excludePhrase?: string
  regex?: string
  regexFlags?: string
  caseSensitive?: boolean
  levels?: string[]
  channel?: string
  cursor?: number | SearchCursor | null
  limit?: number
}

export interface SearchEntry {
  type: 'entry'
  path?: string
  fileName?: string
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
  scanStart?: number
  scanEnd?: number
  mode: 'content' | 'metadata'
  pageSize: number
  fileCount?: number
}

export interface SearchDone {
  type: 'done'
  nextCursor: number | SearchCursor | null
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

function tokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('token')
}

function tokenFromEnv(): string | null {
  const token = import.meta.env.VITE_PEEKER_TOKEN
  return token || null
}

/** Resolve the auth token, preferring the current dev server token over stale storage. */
export function getToken(): string {
  const fromUrl = tokenFromUrl()
  if (fromUrl) return rememberToken(fromUrl)

  const fromEnv = tokenFromEnv()
  if (fromEnv) return rememberToken(fromEnv)

  const fromStorage = sessionStorage.getItem(TOKEN_STORAGE_KEY)
  if (fromStorage) return fromStorage

  throw new Error(
    'Missing token. Restart npm run dev and use the URL printed in the terminal, or run npm start.',
  )
}

/** Keep URL/storage aligned with the live dev token after server restarts. */
export function syncDevToken(): void {
  const fromEnv = tokenFromEnv()
  if (!fromEnv) return
  rememberToken(fromEnv)
  if (!tokenFromUrl()) {
    const url = new URL(window.location.href)
    url.searchParams.set('token', fromEnv)
    window.history.replaceState({}, '', url)
  }
}

function apiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-peeker-token': getToken(),
  }
}

function withToken(path: string): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}token=${encodeURIComponent(getToken())}`
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(withToken(path), {
    ...init,
    headers: { ...apiHeaders(), ...init?.headers },
  })
  if (res.status !== 401) return res

  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  const fromEnv = tokenFromEnv()
  if (fromEnv) rememberToken(fromEnv)

  return fetch(withToken(path), {
    ...init,
    headers: { ...apiHeaders(), ...init?.headers },
  })
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export async function fetchFacets(paths: string[], signal?: AbortSignal): Promise<FileFacets> {
  const body = paths.length === 1 ? { path: paths[0] } : { paths }
  const res = await apiFetch('/api/facets', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<FileFacets>
}

const STAGE_WARN_BYTES = 200 * 1024 * 1024

/** Stream a dropped browser file to the local server for path-based search. */
export async function stageDroppedFile(file: File, signal?: AbortSignal): Promise<string> {
  const upload = () =>
    fetch(withToken('/api/stage'), {
      method: 'PUT',
      headers: {
        'x-peeker-token': getToken(),
        'X-Filename': encodeURIComponent(file.name),
      },
      body: file,
      signal,
    })

  let res = await upload()
  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    const fromEnv = tokenFromEnv()
    if (fromEnv) rememberToken(fromEnv)
    res = await upload()
  }
  if (!res.ok) throw new Error(await parseError(res))
  const data = (await res.json()) as { path: string }
  return data.path
}

export async function stageDroppedFiles(files: File[], signal?: AbortSignal): Promise<string[]> {
  return Promise.all(files.map((file) => stageDroppedFile(file, signal)))
}

export function shouldConfirmStage(files: File[]): boolean {
  return files.some((file) => file.size > STAGE_WARN_BYTES)
}

export function stageConfirmMessage(files: File[]): string {
  const total = files.reduce((sum, file) => sum + file.size, 0)
  const mb = (total / (1024 * 1024)).toFixed(0)
  return `Your browser cannot share file paths, so ${files.length} file(s) (~${mb} MB) will be copied locally for search. For very large logs, use Browse or paste the full path instead. Continue?`
}

/** Open the native Windows file picker and return absolute paths. */
export async function pickLogFiles(): Promise<string[]> {
  const res = await apiFetch('/api/pick', { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  const data = (await res.json()) as { paths: string[] }
  return data.paths
}

export async function openFiles(paths: string[]): Promise<OpenFilesResponse> {
  const body = paths.length === 1 ? { path: paths[0] } : { paths }
  const res = await apiFetch('/api/open', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<OpenFilesResponse>
}

export async function fetchNeighbors(
  path: string,
  opts: { beforeOffset?: number; afterOffset?: number; count?: number },
): Promise<NeighborsResponse> {
  const res = await apiFetch('/api/neighbors', {
    method: 'POST',
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
  })
  const res = await apiFetch(`/api/entry?${params}`)
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EntryBody>
}

export async function countMatches(filters: SearchFilters, signal?: AbortSignal): Promise<number | null> {
  const res = await apiFetch('/api/count', {
    method: 'POST',
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
  const res = await apiFetch('/api/search', {
    method: 'POST',
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
