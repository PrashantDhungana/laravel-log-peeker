import { useCallback, useRef, useState } from 'react'
import {
  pickLogFiles,
  shouldConfirmStage,
  stageConfirmMessage,
  stageDroppedFiles,
  type FileInfo,
  type OpenSummary,
} from '../api'
import { formatBytes, formatDateTime } from '../lib/format'
import { filesFromDataTransfer, pathsFromDataTransfer } from '../lib/paths'

interface OpenFileProps {
  pathsInput: string
  onPathsInputChange: (value: string) => void
  onOpen: () => void
  onPathsDropped: (paths: string[]) => void
  loading: boolean
  error: string | null
  files: FileInfo[]
  summary: OpenSummary | null
}

const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

export function OpenFile({
  pathsInput,
  onPathsInputChange,
  onOpen,
  onPathsDropped,
  loading,
  error,
  files,
  summary,
}: OpenFileProps) {
  const lineCount = pathsInput.split(/\r?\n/).filter((l) => l.trim()).length
  const [dragOver, setDragOver] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const [staging, setStaging] = useState(false)
  const [picking, setPicking] = useState(false)
  const dragDepth = useRef(0)
  const busy = loading || staging || picking

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current += 1
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const resolveDroppedPaths = useCallback(async (dt: DataTransfer): Promise<string[]> => {
    const paths = pathsFromDataTransfer(dt)
    if (paths.length) return paths

    const droppedFiles = filesFromDataTransfer(dt)
    if (!droppedFiles.length) return []

    if (shouldConfirmStage(droppedFiles) && !window.confirm(stageConfirmMessage(droppedFiles))) {
      return []
    }

    setStaging(true)
    try {
      return await stageDroppedFiles(droppedFiles)
    } finally {
      setStaging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragOver(false)
      setDropError(null)

      void (async () => {
        try {
          const paths = await resolveDroppedPaths(e.dataTransfer)
          if (!paths.length) {
            setDropError('No files received. Try Browse, or paste the full path.')
            return
          }
          onPathsDropped(paths)
        } catch (err) {
          setDropError(err instanceof Error ? err.message : String(err))
        }
      })()
    },
    [onPathsDropped, resolveDroppedPaths],
  )

  const handleBrowse = useCallback(() => {
    setDropError(null)
    void (async () => {
      setPicking(true)
      try {
        const paths = await pickLogFiles()
        if (!paths.length) return
        onPathsDropped(paths)
      } catch (err) {
        setDropError(err instanceof Error ? err.message : String(err))
      } finally {
        setPicking(false)
      }
    })()
  }, [onPathsDropped])

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative flex min-w-0 gap-2 rounded-md transition-colors ${
          dragOver ? 'bg-sky-950/40 ring-2 ring-sky-500 ring-inset' : ''
        }`}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-sky-950/60">
            <span className="rounded-md bg-sky-900/90 px-3 py-1.5 text-sm font-medium text-sky-100">
              Drop log files here
            </span>
          </div>
        )}
        {staging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-zinc-950/70">
            <span className="text-sm text-zinc-200">Copying dropped files locally…</span>
          </div>
        )}
        <textarea
          value={pathsInput}
          onChange={(e) => onPathsInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onOpen()
          }}
          rows={lineCount > 1 ? Math.min(lineCount, 4) : 1}
          placeholder={'Drop log files here, or paste paths (one per line)\nC:\\path\\to\\laravel.log'}
          className="min-h-[2.25rem] min-w-0 flex-1 resize-y rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-600 focus:outline-none"
          spellCheck={false}
        />
        <div className="flex shrink-0 flex-col gap-1 self-start">
          {isWindows && (
            <button
              type="button"
              onClick={handleBrowse}
              disabled={busy}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {picking ? '…' : 'Browse'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={busy || !pathsInput.trim()}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '…' : 'Open'}
          </button>
        </div>
      </div>
      {(error || dropError) && <p className="text-xs text-red-400">{error ?? dropError}</p>}
      {summary && files.length > 0 && (
        <p className="truncate text-xs text-zinc-500">
          {summary.fileCount} file{summary.fileCount === 1 ? '' : 's'} loaded · {formatBytes(summary.totalSize)} ·{' '}
          {formatDateTime(summary.firstTime)} – {formatDateTime(summary.lastTime)}
        </p>
      )}
    </div>
  )
}
