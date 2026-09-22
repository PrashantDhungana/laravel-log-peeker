import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countMatches,
  fetchEntry,
  fetchFacets,
  fetchNeighbors,
  openFile,
  streamSearch,
  type FileFacets,
  type FileInfo,
  type NeighborEntry,
  type SearchEntry,
  type SearchFilters,
} from './api'
import { EntryDetail, NEIGHBOR_PAGE } from './components/EntryDetail'
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
  const [facets, setFacets] = useState<FileFacets | null>(null)
  const [facetsLoading, setFacetsLoading] = useState(false)
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
  const [contextAbove, setContextAbove] = useState<NeighborEntry[]>([])
  const [contextBelow, setContextBelow] = useState<NeighborEntry[]>([])
  const [hasMoreAbove, setHasMoreAbove] = useState(false)
  const [hasMoreBelow, setHasMoreBelow] = useState(false)
  const [loadingAbove, setLoadingAbove] = useState(false)
  const [loadingBelow, setLoadingBelow] = useState(false)

  const searchAbort = useRef<AbortController | null>(null)
  const countAbort = useRef<AbortController | null>(null)
  const facetsAbort = useRef<AbortController | null>(null)

  const applyFacets = useCallback((next: FileFacets) => {
    setFacets(next)
    const levelNames = new Set(next.levels.map((l) => l.name))
    const channelNames = new Set(next.channels.map((c) => c.name))
    setFilters((prev) => ({
      ...prev,
      levels: prev.levels.filter((l) => levelNames.has(l)),
      channel: prev.channel && channelNames.has(prev.channel) ? prev.channel : '',
    }))
  }, [])

  const loadFacets = useCallback(async (filePath: string) => {
    facetsAbort.current?.abort()
    const controller = new AbortController()
    facetsAbort.current = controller
    setFacets(null)
    setFacetsLoading(true)
    try {
      const data = await fetchFacets(filePath, controller.signal)
      applyFacets(data)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setFacets(null)
    } finally {
      setFacetsLoading(false)
    }
  }, [applyFacets])

  const resetContext = useCallback(() => {
    setContextAbove([])
    setContextBelow([])
    setHasMoreAbove(false)
    setHasMoreBelow(false)
    setLoadingAbove(false)
    setLoadingBelow(false)
  }, [])

  const handleOpen = useCallback(async () => {
    const trimmed = path.trim()
    if (!trimmed) return
    setOpenLoading(true)
    setOpenError(null)
    setResults([])
    setSelected(null)
    setEntryBody(null)
    resetContext()
    setNextCursor(null)
    setHasMore(false)
    setTotalCount(null)
    setFacets(null)
    facetsAbort.current?.abort()
    try {
      const info = await openFile(trimmed)
      setFileInfo(info)
      setFilters(defaultFilters(info.firstTime, info.lastTime))
      void loadFacets(info.path)
    } catch (err) {
      setFileInfo(null)
      setOpenError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpenLoading(false)
    }
  }, [path, resetContext, loadFacets])

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
        resetContext()
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
    [fileInfo, buildSearchFilters, resetContext],
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
      resetContext()
      setHasMoreAbove(entry.offset > 0)
      setHasMoreBelow(entry.offset + entry.length < fileInfo.size)
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
    [fileInfo, resetContext],
  )

  const handleLoadAbove = useCallback(async () => {
    if (!fileInfo || !selected || loadingAbove) return
    setLoadingAbove(true)
    setEntryError(null)
    try {
      const beforeOffset = contextAbove.length > 0 ? contextAbove[0].offset : selected.offset
      const data = await fetchNeighbors(fileInfo.path, {
        beforeOffset,
        count: NEIGHBOR_PAGE,
      })
      const batch = data.above
      if (!batch) return
      setContextAbove((prev) => [...batch.entries, ...prev])
      setHasMoreAbove(batch.hasMore)
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingAbove(false)
    }
  }, [fileInfo, selected, loadingAbove, contextAbove])

  const handleLoadBelow = useCallback(async () => {
    if (!fileInfo || !selected || loadingBelow) return
    setLoadingBelow(true)
    setEntryError(null)
    try {
      const afterOffset =
        contextBelow.length > 0
          ? contextBelow[contextBelow.length - 1].offset + contextBelow[contextBelow.length - 1].length
          : selected.offset + selected.length
      const data = await fetchNeighbors(fileInfo.path, {
        afterOffset,
        count: NEIGHBOR_PAGE,
      })
      const batch = data.below
      if (!batch) return
      setContextBelow((prev) => [...prev, ...batch.entries])
      setHasMoreBelow(batch.hasMore)
    } catch (err) {
      setEntryError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingBelow(false)
    }
  }, [fileInfo, selected, loadingBelow, contextBelow])

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
        <div className="shrink-0">
          <h1 className="text-sm font-semibold leading-tight">Storage Peeker</h1>
        </div>
        <OpenFile
          path={path}
          onPathChange={setPath}
          onOpen={() => void handleOpen()}
          loading={openLoading}
          error={openError}
          fileInfo={fileInfo}
        />
      </header>

      <FilterBar
        filters={filters}
        facets={facets}
        facetsLoading={facetsLoading}
        onChange={setFilters}
        onSearch={handleSearch}
        searching={searching}
        disabled={!fileInfo}
      />

      {searchError && (
        <p className="shrink-0 border-b border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-400">
          {searchError}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-zinc-800">
        <ResultList
          results={results}
          selectedOffset={selected?.offset ?? null}
          onSelect={(e) => void handleSelect(e)}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          totalCount={totalCount}
        />
        <EntryDetail
          entry={selected}
          body={entryBody}
          loading={entryLoading}
          error={entryError}
          above={contextAbove}
          below={contextBelow}
          hasMoreAbove={hasMoreAbove}
          hasMoreBelow={hasMoreBelow}
          loadingAbove={loadingAbove}
          loadingBelow={loadingBelow}
          onLoadAbove={() => void handleLoadAbove()}
          onLoadBelow={() => void handleLoadBelow()}
        />
      </div>
    </div>
  )
}
