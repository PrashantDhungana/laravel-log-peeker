import { useCallback, useEffect, useRef, useState } from 'react'
import {
  countMatches,
  fetchEntry,
  fetchFacets,
  fetchNeighbors,
  openFiles,
  streamSearch,
  type FileFacets,
  type FileInfo,
  type NeighborEntry,
  type OpenSummary,
  type SearchCursor,
  type SearchEntry,
  type SearchFilters,
} from './api'

type MaximizedPanel = 'results' | 'detail' | null
import { EntryDetail, NEIGHBOR_PAGE } from './components/EntryDetail'
import { FileSelector } from './components/FileSelector'
import { FilterBar, type FilterState } from './components/FilterBar'
import { OpenFile } from './components/OpenFile'
import { ResizableSplitPane } from './components/ResizableSplitPane'
import { ResultList } from './components/ResultList'
import { timeRangeForFiles } from './lib/files'

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

function parsePathsInput(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))]
}

function entryKey(entry: SearchEntry): string {
  return `${entry.path ?? ''}:${entry.offset}`
}

export default function App() {
  const [pathsInput, setPathsInput] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('path') ?? ''
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })
  const [files, setFiles] = useState<FileInfo[]>([])
  const [searchPaths, setSearchPaths] = useState<string[]>([])
  const [summary, setSummary] = useState<OpenSummary | null>(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  const [filters, setFilters] = useState<FilterState>(() => defaultFilters(null, null))
  const [facets, setFacets] = useState<FileFacets | null>(null)
  const [facetsLoading, setFacetsLoading] = useState(false)
  const [results, setResults] = useState<SearchEntry[]>([])
  const [nextCursor, setNextCursor] = useState<number | SearchCursor | null>(null)
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
  const [maximizedPanel, setMaximizedPanel] = useState<MaximizedPanel>(null)

  const searchAbort = useRef<AbortController | null>(null)
  const countAbort = useRef<AbortController | null>(null)
  const facetsAbort = useRef<AbortController | null>(null)

  const fileByPath = useCallback(
    (path: string) => files.find((f) => f.path === path),
    [files],
  )

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

  const loadFacets = useCallback(
    async (paths: string[]) => {
      facetsAbort.current?.abort()
      const controller = new AbortController()
      facetsAbort.current = controller
      setFacets(null)
      setFacetsLoading(true)
      try {
        const data = await fetchFacets(paths, controller.signal)
        applyFacets(data)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setFacets(null)
      } finally {
        setFacetsLoading(false)
      }
    },
    [applyFacets],
  )

  const resetContext = useCallback(() => {
    setContextAbove([])
    setContextBelow([])
    setHasMoreAbove(false)
    setHasMoreBelow(false)
    setLoadingAbove(false)
    setLoadingBelow(false)
  }, [])

  const openPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return
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
        const info = await openFiles(paths)
        const allPaths = info.files.map((f) => f.path)
        setFiles(info.files)
        setSearchPaths(allPaths)
        setSummary(info.summary)
        const { firstTime, lastTime } = timeRangeForFiles(info.files, allPaths)
        setFilters(defaultFilters(firstTime, lastTime))
        void loadFacets(allPaths)
      } catch (err) {
        setFiles([])
        setSearchPaths([])
        setSummary(null)
        setOpenError(err instanceof Error ? err.message : String(err))
      } finally {
        setOpenLoading(false)
      }
    },
    [resetContext, loadFacets],
  )

  const handleOpen = useCallback(() => {
    void openPaths(parsePathsInput(pathsInput))
  }, [pathsInput, openPaths])

  const handlePathsDropped = useCallback(
    (dropped: string[]) => {
      const merged = [...new Set([...parsePathsInput(pathsInput), ...dropped])]
      setPathsInput(merged.join('\n'))
      void openPaths(merged)
    },
    [pathsInput, openPaths],
  )

  const openedInitial = useRef(false)
  useEffect(() => {
    if (!openedInitial.current && pathsInput.trim()) {
      openedInitial.current = true
      void handleOpen()
    }
  }, [pathsInput, handleOpen])

  const handleSearchPathsChange = useCallback(
    (paths: string[]) => {
      setSearchPaths(paths)
      setResults([])
      setSelected(null)
      setEntryBody(null)
      resetContext()
      setNextCursor(null)
      setHasMore(false)
      setTotalCount(null)
      setSearchError(null)
      const { firstTime, lastTime } = timeRangeForFiles(files, paths)
      setFilters((prev) => ({
        ...prev,
        timeStart: firstTime,
        timeEnd: lastTime,
      }))
      if (paths.length) void loadFacets(paths)
    },
    [files, resetContext, loadFacets],
  )

  const buildSearchFilters = useCallback(
    (cursor: number | SearchCursor | null = null): SearchFilters => {
      const paths = searchPaths
      const base = {
        timeStart: filters.timeStart,
        timeEnd: filters.timeEnd,
        phrase: filters.phrase,
        excludePhrase: filters.excludePhrase,
        regex: filters.regex,
        regexFlags: filters.regexFlags,
        caseSensitive: filters.caseSensitive,
        levels: filters.levels,
        channel: filters.channel,
      }
      if (paths.length === 1) {
        return { path: paths[0], ...base, cursor: typeof cursor === 'number' ? cursor : 0 }
      }
      return { paths, ...base, cursor }
    },
    [searchPaths, filters],
  )

  const runSearch = useCallback(
    async (append = false, cursor: number | SearchCursor | null = null) => {
      if (!searchPaths.length) return

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
    [searchPaths, buildSearchFilters, resetContext],
  )

  const handleSearch = () => void runSearch(false, null)
  const handleLoadMore = () => {
    if (nextCursor !== null) void runSearch(true, nextCursor)
  }

  const handleSelect = useCallback(
    async (entry: SearchEntry) => {
      const entryPath = entry.path ?? files[0]?.path
      const file = entryPath ? fileByPath(entryPath) : files[0]
      if (!file || !entryPath) return
      setSelected(entry)
      setEntryBody(null)
      setEntryError(null)
      resetContext()
      setHasMoreAbove(entry.offset > 0)
      setHasMoreBelow(entry.offset + entry.length < file.size)
      setEntryLoading(true)
      try {
        const data = await fetchEntry(entryPath, entry.offset, entry.length)
        setEntryBody(data.body)
      } catch (err) {
        setEntryError(err instanceof Error ? err.message : String(err))
      } finally {
        setEntryLoading(false)
      }
    },
    [files, fileByPath, resetContext],
  )

  const handleLoadAbove = useCallback(async () => {
    if (!selected || loadingAbove) return
    const entryPath = selected.path ?? files[0]?.path
    if (!entryPath) return
    setLoadingAbove(true)
    setEntryError(null)
    try {
      const beforeOffset = contextAbove.length > 0 ? contextAbove[0].offset : selected.offset
      const data = await fetchNeighbors(entryPath, {
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
  }, [files, selected, loadingAbove, contextAbove])

  const handleLoadBelow = useCallback(async () => {
    if (!selected || loadingBelow) return
    const entryPath = selected.path ?? files[0]?.path
    if (!entryPath) return
    setLoadingBelow(true)
    setEntryError(null)
    try {
      const afterOffset =
        contextBelow.length > 0
          ? contextBelow[contextBelow.length - 1].offset + contextBelow[contextBelow.length - 1].length
          : selected.offset + selected.length
      const data = await fetchNeighbors(entryPath, {
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
  }, [files, selected, loadingBelow, contextBelow])

  const toggleMaximize = useCallback((panel: Exclude<MaximizedPanel, null>) => {
    setMaximizedPanel((current) => (current === panel ? null : panel))
  }, [])

  useEffect(() => {
    if (!maximizedPanel) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMaximizedPanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [maximizedPanel])

  return (
    <div className="flex h-screen flex-col">
      {!maximizedPanel && (
        <>
          <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
            <div className="shrink-0">
              <h1 className="text-sm font-semibold leading-tight">Storage Peeker</h1>
            </div>
            <OpenFile
              pathsInput={pathsInput}
              onPathsInputChange={setPathsInput}
              onOpen={handleOpen}
              onPathsDropped={handlePathsDropped}
              loading={openLoading}
              error={openError}
              files={files}
              summary={summary}
            />
          </header>

          <FileSelector
            files={files}
            selectedPaths={searchPaths}
            onChange={handleSearchPathsChange}
            disabled={openLoading}
          />

          <FilterBar
            filters={filters}
            facets={facets}
            facetsLoading={facetsLoading}
            searchScope={
              files.length > 1
                ? searchPaths.length === files.length
                  ? `All ${files.length} files`
                  : `${searchPaths.length} of ${files.length} files`
                : null
            }
            onChange={setFilters}
            onSearch={handleSearch}
            searching={searching}
            disabled={!searchPaths.length}
          />

          {searchError && (
            <p className="shrink-0 border-b border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-400">
              {searchError}
            </p>
          )}
        </>
      )}

      {maximizedPanel ? (
        <div className="relative min-h-0 flex-1">
          {maximizedPanel !== 'detail' && (
            <ResultList
              results={results}
              selectedKey={selected ? entryKey(selected) : null}
              onSelect={(e) => void handleSelect(e)}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={handleLoadMore}
              totalCount={totalCount}
              maximized
              onToggleMaximize={() => toggleMaximize('results')}
            />
          )}
          {maximizedPanel !== 'results' && (
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
              maximized
              onToggleMaximize={() => toggleMaximize('detail')}
            />
          )}
        </div>
      ) : (
        <ResizableSplitPane
          left={
            <ResultList
              results={results}
              selectedKey={selected ? entryKey(selected) : null}
              onSelect={(e) => void handleSelect(e)}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={handleLoadMore}
              totalCount={totalCount}
              maximized={false}
              onToggleMaximize={() => toggleMaximize('results')}
            />
          }
          right={
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
              maximized={false}
              onToggleMaximize={() => toggleMaximize('detail')}
            />
          }
        />
      )}
    </div>
  )
}
