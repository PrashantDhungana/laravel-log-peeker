import type { FileInfo, OpenSummary } from '../api'
import { formatBytes, formatDateTime } from '../lib/format'

interface OpenFileProps {
  pathsInput: string
  onPathsInputChange: (value: string) => void
  onOpen: () => void
  loading: boolean
  error: string | null
  files: FileInfo[]
  summary: OpenSummary | null
}

export function OpenFile({
  pathsInput,
  onPathsInputChange,
  onOpen,
  loading,
  error,
  files,
  summary,
}: OpenFileProps) {
  const lineCount = pathsInput.split(/\r?\n/).filter((l) => l.trim()).length

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 gap-2">
        <textarea
          value={pathsInput}
          onChange={(e) => onPathsInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onOpen()
          }}
          rows={lineCount > 1 ? Math.min(lineCount, 4) : 1}
          placeholder={'C:\\path\\to\\laravel.log\n(one path per line for multiple files)'}
          className="min-h-[2.25rem] min-w-0 flex-1 resize-y rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-600 focus:outline-none"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || !pathsInput.trim()}
          className="shrink-0 self-start rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '…' : 'Open'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {summary && files.length > 0 && (
        <div className="text-xs text-zinc-500">
          <p className="truncate">
            {summary.fileCount} file{summary.fileCount === 1 ? '' : 's'} · {formatBytes(summary.totalSize)} ·{' '}
            {formatDateTime(summary.firstTime)} – {formatDateTime(summary.lastTime)}
          </p>
          {files.length > 1 && (
            <ul className="mt-0.5 max-h-16 overflow-auto">
              {files.map((f) => (
                <li key={f.path} className="truncate" title={f.path}>
                  {f.path.split(/[/\\]/).pop()} ({formatBytes(f.size)})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
