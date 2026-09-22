import { useState } from 'react'
import { formatDateTime, inputValueToMs, msToInputValue } from '../lib/format'
import { LEVELS, levelColour } from '../lib/levels'

export interface FilterState {
  timeStart: number | null
  timeEnd: number | null
  phrase: string
  excludePhrase: string
  regex: string
  regexFlags: string
  caseSensitive: boolean
  levels: string[]
  channel: string
}

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  onSearch: () => void
  searching: boolean
  disabled: boolean
}

function activeFilterCount(filters: FilterState): number {
  let n = 0
  if (filters.phrase.trim()) n++
  if (filters.excludePhrase.trim()) n++
  if (filters.regex.trim()) n++
  if (filters.channel.trim()) n++
  if (filters.levels.length) n++
  if (filters.caseSensitive) n++
  return n
}

function FilterSummary({ filters }: { filters: FilterState }) {
  const chips: string[] = []
  if (filters.phrase.trim()) chips.push(`"${filters.phrase.trim()}"`)
  if (filters.regex.trim()) chips.push(`/ ${filters.regex.trim()} /`)
  if (filters.excludePhrase.trim()) chips.push(`−"${filters.excludePhrase.trim()}"`)
  if (filters.channel.trim()) chips.push(filters.channel.trim())
  if (filters.levels.length) chips.push(filters.levels.join(', '))
  if (filters.timeStart || filters.timeEnd) {
    chips.push(`${formatDateTime(filters.timeStart)} – ${formatDateTime(filters.timeEnd)}`)
  }
  if (filters.caseSensitive) chips.push('Aa')

  if (chips.length === 0) {
    return <span className="text-xs text-zinc-500">All entries in time range</span>
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="max-w-[12rem] truncate rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300"
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

export function FilterBar({ filters, onChange, onSearch, searching, disabled }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)
  const activeCount = activeFilterCount(filters)

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleLevel = (level: string) => {
    const levels = filters.levels.includes(level)
      ? filters.levels.filter((l) => l !== level)
      : [...filters.levels, level]
    set('levels', levels)
  }

  const inputClass =
    'w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm focus:border-sky-600 focus:outline-none'

  return (
    <section className="shrink-0 border-b border-zinc-800 bg-zinc-900/80">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          aria-expanded={expanded}
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ''} {expanded ? '▴' : '▾'}
        </button>

        {!expanded && <FilterSummary filters={filters} />}

        <button
          type="button"
          onClick={onSearch}
          disabled={disabled || searching}
          className="ml-auto shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {expanded && (
        <div className="max-h-52 overflow-y-auto border-t border-zinc-800 px-3 py-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">From</span>
              <input
                type="datetime-local"
                value={msToInputValue(filters.timeStart)}
                onChange={(e) => set('timeStart', inputValueToMs(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">To</span>
              <input
                type="datetime-local"
                value={msToInputValue(filters.timeEnd)}
                onChange={(e) => set('timeEnd', inputValueToMs(e.target.value))}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">Phrase</span>
              <input
                type="text"
                value={filters.phrase}
                onChange={(e) => set('phrase', e.target.value)}
                placeholder="connection refused"
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">Exclude</span>
              <input
                type="text"
                value={filters.excludePhrase}
                onChange={(e) => set('excludePhrase', e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">Regex</span>
              <input
                type="text"
                value={filters.regex}
                onChange={(e) => set('regex', e.target.value)}
                className={`${inputClass} font-mono text-xs`}
                spellCheck={false}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">Flags</span>
              <input
                type="text"
                value={filters.regexFlags}
                onChange={(e) => set('regexFlags', e.target.value)}
                placeholder="i"
                className={`${inputClass} font-mono text-xs`}
                spellCheck={false}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-zinc-500">Channel</span>
              <input
                type="text"
                value={filters.channel}
                onChange={(e) => set('channel', e.target.value)}
                placeholder="production"
                className={inputClass}
              />
            </label>
            <label className="flex items-end gap-2 pb-1 text-xs">
              <input
                type="checkbox"
                checked={filters.caseSensitive}
                onChange={(e) => set('caseSensitive', e.target.checked)}
                className="rounded border-zinc-600"
              />
              Case sensitive
            </label>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {LEVELS.map((level) => (
              <label
                key={level}
                className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  filters.levels.includes(level)
                    ? levelColour(level) + ' border-transparent'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={filters.levels.includes(level)}
                  onChange={() => toggleLevel(level)}
                />
                {level}
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
