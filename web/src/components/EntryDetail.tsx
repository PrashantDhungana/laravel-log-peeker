import type { SearchEntry } from '../api'
import { formatDateTime } from '../lib/format'
import { levelColour } from '../lib/levels'

interface EntryDetailProps {
  entry: SearchEntry | null
  body: string | null
  loading: boolean
  error: string | null
}

export function EntryDetail({ entry, body, loading, error }: EntryDetailProps) {
  if (!entry) {
    return (
      <aside className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        Select a result to view the full entry.
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 font-medium ${levelColour(entry.level)}`}>{entry.level}</span>
          <span className="text-zinc-500">{entry.channel}</span>
          <span className="text-zinc-500">{formatDateTime(entry.time)}</span>
          <span className="text-zinc-600">offset {entry.offset}</span>
        </div>
        <p className="mt-2 text-sm font-medium text-zinc-200">{entry.message}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-zinc-500">Loading entry…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {body && (
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-zinc-300">
            {body}
          </pre>
        )}
      </div>
    </aside>
  )
}
