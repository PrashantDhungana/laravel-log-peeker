import type { FileInfo } from '../api'
import { formatBytes } from '../lib/format'

interface FileSelectorProps {
  files: FileInfo[]
  selectedPaths: string[]
  onChange: (paths: string[]) => void
  disabled?: boolean
}

function fileLabel(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

export function FileSelector({ files, selectedPaths, onChange, disabled }: FileSelectorProps) {
  if (files.length <= 1) return null

  const selectedSet = new Set(selectedPaths)
  const allSelected = files.every((f) => selectedSet.has(f.path))
  const noneSelected = selectedPaths.length === 0

  const toggle = (path: string) => {
    if (disabled) return
    if (selectedSet.has(path)) {
      if (selectedPaths.length <= 1) return
      onChange(selectedPaths.filter((p) => p !== path))
      return
    }
    onChange([...selectedPaths, path])
  }

  const selectAll = () => {
    if (disabled) return
    onChange(files.map((f) => f.path))
  }

  return (
    <section className="shrink-0 border-b border-zinc-800 bg-zinc-950/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">Search in</span>

        <button
          type="button"
          onClick={selectAll}
          disabled={disabled || allSelected}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${
            allSelected
              ? 'border-sky-600/60 bg-sky-950/50 text-sky-200'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          }`}
        >
          All · {files.length} files
        </button>

        {!allSelected && !noneSelected && (
          <span className="text-xs text-zinc-500">
            {selectedPaths.length} of {files.length} selected
          </span>
        )}

        {noneSelected && (
          <span className="text-xs text-amber-500">Select at least one file to search</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {files.map((file) => {
          const active = selectedSet.has(file.path)
          const name = fileLabel(file.path)
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => toggle(file.path)}
              disabled={disabled}
              title={file.path}
              className={`flex max-w-[14rem] flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-sky-600/70 bg-sky-950/40 text-sky-100'
                  : 'border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate text-xs font-medium">
                <span
                  className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] ${
                    active ? 'border-sky-500 bg-sky-600 text-white' : 'border-zinc-600 bg-zinc-950'
                  }`}
                  aria-hidden
                >
                  {active ? '✓' : ''}
                </span>
                <span className="truncate">{name}</span>
              </span>
              <span className="mt-0.5 pl-5 text-[10px] text-zinc-500">{formatBytes(file.size)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
