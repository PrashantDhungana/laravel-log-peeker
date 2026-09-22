import type { FileInfo } from '../api'
import { formatBytes, formatDateTime } from '../lib/format'

interface OpenFileProps {
  path: string
  onPathChange: (path: string) => void
  onOpen: () => void
  loading: boolean
  error: string | null
  fileInfo: FileInfo | null
}

export function OpenFile({ path, onPathChange, onOpen, loading, error, fileInfo }: OpenFileProps) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">Open log file</h2>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen()}
          placeholder="C:\path\to\storage\logs\laravel.log"
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-600 focus:outline-none"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || !path.trim()}
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Opening…' : 'Open'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {fileInfo && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-500">Size</dt>
            <dd>{formatBytes(fileInfo.size)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Format</dt>
            <dd className="capitalize">{fileInfo.format}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">First entry</dt>
            <dd>{formatDateTime(fileInfo.firstTime)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Last entry</dt>
            <dd>{formatDateTime(fileInfo.lastTime)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
