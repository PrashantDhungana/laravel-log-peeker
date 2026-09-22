import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countMatches,
  fetchEntry,
  openFile,
  streamSearch,
  type FileInfo,
  type SearchEntry,
  type SearchFilters,
} from './api'
import { EntryDetail } from './components/EntryDetail'
import { FilterBar, type FilterState } from './components/FilterBar'
import { OpenFile } from './components/OpenFile'
import { ResultList } from './components/ResultList'

function defaultFilters(firstTime: number | null, lastTime: number | null): FilterState {
  return {
    timeStart: firstTime,
    timeEnd: lastTime,
    phrase: '',
    excludePhrase: '',
    regex: '',
    regexFlags: 'i',
    caseSensitive: false,
    levels: [],
    channel: '',
  }
}

export default function App() {
  const [path, setPath] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('path') ?? ''
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  const [filters, setFilters] = useState<FilterState>(() => defaultFilters(null, null))
  const [results, setResults] = useState<SearchEntry[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)

  const [selected, setSelected] = useState<SearchEntry | null>(null)
  const [entryBody, setEntryBody] = useState<string | null>(null)
  const [entryLoading, setEntryLoading] = useState(false)
  const [entryError, setEntryError] = useState<string | null>(null)

  const searchAbort = useRef<AbortController | null>(null)
  const countAbort = useRef<AbortController | null>(null)

  const handleOpen = useCallback(async () => {
    const trimmed = path.trim()
    if (!trimmed) return
    setOpenLoading(true)
    setOpenError(null)
    setResults([])
    setSelected(null)
    setEntryBody(null)
    setNextCursor(null)
    setHasMore(false)
    setTotalCount(null)
    try {
      const info = await openFile(trimmed)
      setFileInfo(info)
      setFilters(defaultFilters(info.firstTime, info.lastTime))
    } catch (err) {
      setFileInfo(null)
      setOpenError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpenLoading(false)
    }
  }, [path])

  const openedInitial = useRef(false)
  useEffect(() => {
    if (!openedInitial.current && path.trim()) {
      openedInitial.current = true
      void handleOpen()
    }
  }, [path, handleOpen])

  const buildSearchFilters = useCallback(
    (cursor = 0): SearchFilters => ({
      path: fileInfo!.path,
      timeStart: filters.timeStart,
      timeEnd: filters.timeEnd,
      phrase: filters.phrase,
      excludePhrase: filters.excludePhrase,
      regex: filters.regex,
      regexFlags: filters.regexFlags,
      caseSensitive: filters.caseSensitive,
      levels: filters.levels,
      channel: filters.channel,
      cursor,
    }),
    [fileInfo, filters],
  )

  const runSearch = useCallback(
    async (append = false, cursor = 0) => {
      if (!fileInfo) return

      searchAbort.current?.abort()
      countAbort.current?.abort()
      const controller = new AbortController()
      searchAbort.current = controller

      if (append) setLoadingMore(true)
      else {
        setSearching(true)
        setResults([])
        setSelected(null)
        setEntryBody(null)
        setNextCursor(null)
        setHasMore(false)
        setTotalCount(null)
      }
      setSearchError(null)

      const countController = new AbortController()
      countAbort.current = countController
      void countMatches(buildSearchFilters(cursor), countController.signal).then(setTotalCount)

      try {
        const page: SearchEntry[] = []
        for await (const event of streamSearch(buildSearchFilters(cursor), controller.signal)) {
          if (event.type === 'error') throw new Error(event.message)
          if (event.type === 'entry') page.push(event)
          if (event.type === 'done') {
            setNextCursor(event.nextCursor)
            setHasMore(event.hasMore)
          }
        }
        setResults((prev) => (append ? [...prev, ...page] : page))
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setSearchError(err instanceof Error ? err.message : String(err))
      } finally {
        setSearching(false)
        setLoadingMore(false)
      }
    },
    [fileInfo, buildSearchFilters],
  )

  const handleSearch = () => void runSearch(false, 0)
  const handleLoadMore = () => {
    if (nextCursor !== null) void runSearch(true, nextCursor)
  }

  const handleSelect = useCallback(
    async (entry: SearchEntry) => {
      if (!fileInfo) return
      setSelected(entry)
      setEntryBody(null)
      setEntryError(null)
      setEntryLoading(true)
      try {
        const data = await fetchEntry(fileInfo.path, entry.offset, entry.length)
        setEntryBody(data.body)
      } catch (err) {
        setEntryError(err instanceof Error ? err.message : String(err))
      } finally {
        setEntryLoading(false)
      }
    },
    [fileInfo],
  )

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Storage Peeker</h1>
        <p className="text-xs text-zinc-500">Laravel log search powered by ripgrep</p>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <OpenFile
          path={path}
          onPathChange={setPath}
          onOpen={() => void handleOpen()}
          loading={openLoading}
          error={openError}
          fileInfo={fileInfo}
        />

        <FilterBar
          filters={filters}
          onChange={setFilters}
          onSearch={handleSearch}
          searching={searching}
          disabled={!fileInfo}
        />

        {searchError && <p className="text-sm text-red-400">{searchError}</p>}

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
          <ResultList
            results={results}
            selectedOffset={selected?.offset ?? null}
            onSelect={(e) => void handleSelect(e)}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            totalCount={totalCount}
          />
          <EntryDetail entry={selected} body={entryBody} loading={entryLoading} error={entryError} />
        </div>
      </main>
    </div>
  )
}
