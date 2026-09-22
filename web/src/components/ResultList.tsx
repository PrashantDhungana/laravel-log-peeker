import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SearchEntry } from '../api'
import { formatDateTime } from '../lib/format'
import { levelColour } from '../lib/levels'
import { PanelMaximizeButton } from './PanelMaximizeButton'

interface ResultListProps {
  results: SearchEntry[]
  searchPaths: string[]
  selectedKey: string | null
  onSelect: (entry: SearchEntry) => void
  fileHasMore: Record<string, boolean>
  loadingMoreByPath: Record<string, boolean>
  onLoadMoreForFile: (path: string) => void
  totalCount: number | null
  maximized: boolean
  onToggleMaximize: () => void
}

interface FileGroup {
  path: string
  fileName: string
  entries: SearchEntry[]
}

type VirtualRow =
  | { kind: 'header'; path: string; fileName: string; count: number; collapsed: boolean }
  | { kind: 'entry'; entry: SearchEntry }
  | { kind: 'load-more'; path: string }

function entryKey(entry: SearchEntry): string {
  return `${entry.path ?? ''}:${entry.offset}`
}

function pathFromEntryKey(key: string): string | null {
  const idx = key.lastIndexOf(':')
  if (idx <= 0) return null
  return key.slice(0, idx)
}

function fileNameForPath(path: string, entryFileName?: string): string {
  return entryFileName ?? path.split(/[/\\]/).pop() ?? path ?? 'Log'
}

function groupByFile(results: SearchEntry[]): FileGroup[] {
  const groups: FileGroup[] = []
  const index = new Map<string, number>()

  for (const entry of results) {
    const path = entry.path ?? ''
    let groupIndex = index.get(path)
    if (groupIndex === undefined) {
      groupIndex = groups.length
      index.set(path, groupIndex)
      groups.push({
        path,
        fileName: fileNameForPath(path, entry.fileName),
        entries: [],
      })
    }
    groups[groupIndex].entries.push(entry)
  }

  return groups
}

function orderedFileGroups(
  results: SearchEntry[],
  searchPaths: string[],
): FileGroup[] {
  const fromResults = groupByFile(results)
  const byPath = new Map(fromResults.map((group) => [group.path, group]))
  const groups: FileGroup[] = []

  for (const path of searchPaths) {
    const existing = byPath.get(path)
    if (existing) {
      groups.push(existing)
      continue
    }
    groups.push({
      path,
      fileName: fileNameForPath(path),
      entries: [],
    })
  }

  for (const group of fromResults) {
    if (!searchPaths.includes(group.path)) groups.push(group)
  }

  return groups
}

function buildRows(
  groups: FileGroup[],
  collapsed: Set<string>,
  fileHasMore: Record<string, boolean>,
): VirtualRow[] {
  const rows: VirtualRow[] = []
  for (const group of groups) {
    const isCollapsed = collapsed.has(group.path)
    rows.push({
      kind: 'header',
      path: group.path,
      fileName: group.fileName,
      count: group.entries.length,
      collapsed: isCollapsed,
    })
    if (!isCollapsed) {
      for (const entry of group.entries) {
        rows.push({ kind: 'entry', entry })
      }
      if (fileHasMore[group.path]) {
        rows.push({ kind: 'load-more', path: group.path })
      }
    }
  }
  return rows
}

function rowHeight(row: VirtualRow | undefined): number {
  if (row?.kind === 'header') return 44
  if (row?.kind === 'load-more') return 44
  return 72
}

export function ResultList({
  results,
  searchPaths,
  selectedKey,
  onSelect,
  fileHasMore,
  loadingMoreByPath,
  onLoadMoreForFile,
  totalCount,
  maximized,
  onToggleMaximize,
}: ResultListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const groups = useMemo(
    () => orderedFileGroups(results, searchPaths),
    [results, searchPaths],
  )
  const rows = useMemo(() => buildRows(groups, collapsed, fileHasMore), [groups, collapsed, fileHasMore])

  useEffect(() => {
    setCollapsed(new Set())
  }, [results])

  useEffect(() => {
    if (!selectedKey) return
    const path = pathFromEntryKey(selectedKey)
    if (!path) return
    setCollapsed((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [selectedKey])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => rowHeight(rows[index]),
    overscan: 8,
  })

  const toggleGroup = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (results.length === 0) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
        No results yet. Open a log file and run a search.
      </section>
    )
  }

  return (
    <section
      className={
        maximized
          ? 'fixed inset-0 z-50 flex flex-col bg-zinc-950'
          : 'flex min-h-0 flex-1 flex-col bg-zinc-950/40'
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-500">
        <span>
          {results.length} result{results.length === 1 ? '' : 's'}
          {groups.length > 1 && ` · ${groups.length} files`}
          {totalCount !== null && ` · ~${totalCount} line matches`}
        </span>
        <PanelMaximizeButton
          maximized={maximized}
          onToggle={onToggleMaximize}
          panelLabel="results"
        />
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (!row) return null

            if (row.kind === 'header') {
              return (
                <button
                  key={`header-${row.path}`}
                  type="button"
                  onClick={() => toggleGroup(row.path)}
                  className="absolute left-0 top-0 flex w-full items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-left hover:bg-zinc-800/80"
                  style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
                  title={row.path}
                >
                  <span className="shrink-0 text-xs text-zinc-400" aria-hidden>
                    {row.collapsed ? '▸' : '▾'}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-100">{row.fileName}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {row.count} result{row.count === 1 ? '' : 's'}
                  </span>
                </button>
              )
            }

            if (row.kind === 'load-more') {
              const loading = Boolean(loadingMoreByPath[row.path])
              return (
                <div
                  key={`load-more-${row.path}`}
                  className="absolute left-0 top-0 flex w-full items-center border-b border-zinc-800/80 px-4 py-2 pl-8"
                  style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
                >
                  <button
                    type="button"
                    onClick={() => onLoadMoreForFile(row.path)}
                    disabled={loading}
                    className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )
            }

            const entry = row.entry
            const selected = selectedKey === entryKey(entry)
            return (
              <button
                key={`${entryKey(entry)}-${item.index}`}
                type="button"
                onClick={() => onSelect(entry)}
                className={`absolute left-0 top-0 flex w-full flex-col gap-1 border-b border-zinc-800/80 py-3 pl-8 pr-4 text-left hover:bg-zinc-800/50 ${
                  selected ? 'bg-zinc-800/70' : ''
                }`}
                style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 font-medium ${levelColour(entry.level)}`}>
                    {entry.level}
                  </span>
                  <span className="text-zinc-500">{entry.channel}</span>
                  <span className="text-zinc-500">{formatDateTime(entry.time)}</span>
                  {entry.truncated && <span className="text-amber-500">truncated</span>}
                </div>
                <p className="truncate text-sm text-zinc-200">{entry.message || '(no message)'}</p>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
