import type { NeighborEntry, SearchEntry } from '../api'
import { formatDateTime } from '../lib/format'
import { levelColour } from '../lib/levels'
import { PanelMaximizeButton } from './PanelMaximizeButton'

const NEIGHBOR_PAGE = 3

interface EntryDetailProps {
  entry: SearchEntry | null
  body: string | null
  loading: boolean
  error: string | null
  above: NeighborEntry[]
  below: NeighborEntry[]
  hasMoreAbove: boolean
  hasMoreBelow: boolean
  loadingAbove: boolean
  loadingBelow: boolean
  onLoadAbove: () => void
  onLoadBelow: () => void
  maximized: boolean
  onToggleMaximize: () => void
}

function ContextEntry({ entry, muted = false }: { entry: NeighborEntry | SearchEntry; muted?: boolean }) {
  const text = 'body' in entry && entry.body ? entry.body : null
  return (
    <article
      className={`rounded-md border px-3 py-2 ${
        muted ? 'border-zinc-800/80 bg-zinc-950/40' : 'border-sky-800/60 bg-sky-950/20'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-2 py-0.5 font-medium ${levelColour(entry.level)}`}>{entry.level}</span>
        {'fileName' in entry && entry.fileName && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400" title={'path' in entry ? entry.path : undefined}>
            {entry.fileName}
          </span>
        )}
        <span className="text-zinc-500">{entry.channel}</span>
        <span className="text-zinc-500">{formatDateTime(entry.time)}</span>
        {entry.truncated && <span className="text-amber-500">truncated</span>}
      </div>
      <p className="mt-1 text-sm text-zinc-300">{entry.message || '(no message)'}</p>
      {text && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-400">
          {text}
        </pre>
      )}
    </article>
  )
}

export function EntryDetail({
  entry,
  body,
  loading,
  error,
  above,
  below,
  hasMoreAbove,
  hasMoreBelow,
  loadingAbove,
  loadingBelow,
  onLoadAbove,
  onLoadBelow,
  maximized,
  onToggleMaximize,
}: EntryDetailProps) {
  if (!entry) {
    return (
      <aside className="flex min-h-0 flex-1 items-center justify-center bg-zinc-950/40 p-6 text-sm text-zinc-500">
        Select a result to view the full entry.
      </aside>
    )
  }

  const focal: NeighborEntry = {
    ...entry,
    body: body ?? '',
  }

  return (
    <aside
      className={
        maximized
          ? 'fixed inset-0 z-50 flex flex-col bg-zinc-950'
          : 'flex min-h-0 flex-1 flex-col bg-zinc-950/40'
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-500">
        <span className="truncate text-zinc-300">
          {entry.fileName ?? 'Entry detail'}
          {entry.channel && ` · ${entry.channel}`}
        </span>
        <PanelMaximizeButton
          maximized={maximized}
          onToggle={onToggleMaximize}
          panelLabel="entry detail"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="flex flex-col gap-3">
          {(hasMoreAbove || above.length > 0) && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onLoadAbove}
                disabled={loadingAbove || !hasMoreAbove}
                className="self-start rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingAbove
                  ? 'Loading…'
                  : above.length === 0
                    ? `Load ${NEIGHBOR_PAGE} entries above`
                    : hasMoreAbove
                      ? `Load ${NEIGHBOR_PAGE} more above`
                      : 'No more entries above'}
              </button>
              {above.map((item) => (
                <ContextEntry key={item.offset} entry={item} muted />
              ))}
            </div>
          )}

          {loading && !body && <p className="text-sm text-zinc-500">Loading entry…</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {body && <ContextEntry entry={focal} />}

          {(hasMoreBelow || below.length > 0) && (
            <div className="flex flex-col gap-2">
              {below.map((item) => (
                <ContextEntry key={item.offset} entry={item} muted />
              ))}
              <button
                type="button"
                onClick={onLoadBelow}
                disabled={loadingBelow || !hasMoreBelow}
                className="self-start rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingBelow
                  ? 'Loading…'
                  : below.length === 0
                    ? `Load ${NEIGHBOR_PAGE} entries below`
                    : hasMoreBelow
                      ? `Load ${NEIGHBOR_PAGE} more below`
                      : 'No more entries below'}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export { NEIGHBOR_PAGE }
