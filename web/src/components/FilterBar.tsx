import { inputValueToMs, msToInputValue } from '../lib/format'
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

export function FilterBar({ filters, onChange, onSearch, searching, disabled }: FilterBarProps) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onChange({ ...filters, [key]: value })
  }

  const toggleLevel = (level: string) => {
    const levels = filters.levels.includes(level)
      ? filters.levels.filter((l) => l !== level)
      : [...filters.levels, level]
    set('levels', levels)
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">Filters</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">From</span>
          <input
            type="datetime-local"
            value={msToInputValue(filters.timeStart)}
            onChange={(e) => set('timeStart', inputValueToMs(e.target.value))}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-sky-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">To</span>
          <input
            type="datetime-local"
            value={msToInputValue(filters.timeEnd)}
            onChange={(e) => set('timeEnd', inputValueToMs(e.target.value))}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-sky-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Phrase</span>
          <input
            type="text"
            value={filters.phrase}
            onChange={(e) => set('phrase', e.target.value)}
            placeholder="connection refused"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-sky-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Exclude phrase</span>
          <input
            type="text"
            value={filters.excludePhrase}
            onChange={(e) => set('excludePhrase', e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-sky-600 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Regex</span>
          <input
            type="text"
            value={filters.regex}
            onChange={(e) => set('regex', e.target.value)}
            placeholder="SQLSTATE\[.*\]"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs focus:border-sky-600 focus:outline-none"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Regex flags</span>
          <input
            type="text"
            value={filters.regexFlags}
            onChange={(e) => set('regexFlags', e.target.value)}
            placeholder="i"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs focus:border-sky-600 focus:outline-none"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">Channel</span>
          <input
            type="text"
            value={filters.channel}
            onChange={(e) => set('channel', e.target.value)}
            placeholder="production"
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 focus:border-sky-600 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={filters.caseSensitive}
            onChange={(e) => set('caseSensitive', e.target.checked)}
            className="rounded border-zinc-600"
          />
          Case sensitive
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-sm text-zinc-500">Levels</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((level) => (
            <label
              key={level}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
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
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSearch}
          disabled={disabled || searching}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
    </section>
  )
}
