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
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 gap-2">
        <input
          type="text"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen()}
          placeholder="C:\path\to\storage\logs\laravel.log"
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-600 focus:outline-none"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || !path.trim()}
          className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '…' : 'Open'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {fileInfo && (
        <p className="truncate text-xs text-zinc-500">
          {formatBytes(fileInfo.size)} · {fileInfo.format} · {formatDateTime(fileInfo.firstTime)} –{' '}
          {formatDateTime(fileInfo.lastTime)}
        </p>
      )}
    </div>
  )
}
