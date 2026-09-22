import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SearchEntry } from '../api'
import { formatDateTime } from '../lib/format'
import { levelColour } from '../lib/levels'

interface ResultListProps {
  results: SearchEntry[]
  selectedKey: string | null
  multiFile: boolean
  onSelect: (entry: SearchEntry) => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  totalCount: number | null
}

function entryKey(entry: SearchEntry): string {
  return `${entry.path ?? ''}:${entry.offset}`
}

export function ResultList({
  results,
  selectedKey,
  multiFile,
  onSelect,
  hasMore,
  loadingMore,
  onLoadMore,
  totalCount,
}: ResultListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8,
  })

  if (results.length === 0) {
    return (
      <section className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950/40 p-6 text-center text-sm text-zinc-500">
        No results yet. Open a log file and run a search.
      </section>
    )
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-zinc-950/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2 text-xs text-zinc-500">
        <span>
          {results.length} result{results.length === 1 ? '' : 's'}
          {totalCount !== null && ` · ~${totalCount} line matches`}
        </span>
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-md border border-zinc-700 px-3 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const entry = results[item.index]
            const selected = selectedKey === entryKey(entry)
            return (
              <button
                key={`${entryKey(entry)}-${item.index}`}
                type="button"
                onClick={() => onSelect(entry)}
                className={`absolute left-0 top-0 flex w-full flex-col gap-1 border-b border-zinc-800/80 px-4 py-3 text-left hover:bg-zinc-800/50 ${
                  selected ? 'bg-zinc-800/70' : ''
                }`}
                style={{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-2 py-0.5 font-medium ${levelColour(entry.level)}`}>
                    {entry.level}
                  </span>
                  {multiFile && entry.fileName && (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400" title={entry.path}>
                      {entry.fileName}
                    </span>
                  )}
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
