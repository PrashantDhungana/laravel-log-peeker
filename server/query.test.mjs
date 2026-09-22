import { describe, expect, it } from 'vitest'
import { buildRgArgs, entryMatchesFilters } from './query.mjs'

describe('buildRgArgs', () => {
  it('uses fixed-string content mode for phrase', () => {
    const { mode, args } = buildRgArgs({ phrase: 'connection refused', caseSensitive: false })
    expect(mode).toBe('content')
    expect(args).toContain('-F')
    expect(args).toContain('-i')
    expect(args).toContain('connection refused')
  })

  it('uses regex content mode', () => {
    const { mode, args } = buildRgArgs({ regex: 'SQLSTATE\\[.*\\]', regexFlags: 'i' })
    expect(mode).toBe('content')
    expect(args).toContain('-i')
    expect(args.some((a) => a.includes('SQLSTATE'))).toBe(true)
  })

  it('builds metadata header regex with level and channel', () => {
    const { mode, args } = buildRgArgs({ levels: ['ERROR', 'CRITICAL'], channel: 'production' })
    expect(mode).toBe('metadata')
    const pattern = args[args.indexOf('-e') + 1]
    expect(pattern).toContain('production')
    expect(pattern).toContain('ERROR')
    expect(pattern).toContain('CRITICAL')
  })
})

describe('entryMatchesFilters', () => {
  const entry = {
    time: Date.parse('2026-02-15T14:22:01'),
    level: 'ERROR',
    channel: 'production',
    body: 'SQLSTATE connection refused',
  }

  it('filters by time, level, channel', () => {
    expect(entryMatchesFilters(entry, { timeStart: entry.time - 1, timeEnd: entry.time + 1, levels: ['ERROR'], channel: 'production' })).toBe(true)
    expect(entryMatchesFilters(entry, { levels: ['INFO'] })).toBe(false)
    expect(entryMatchesFilters(entry, { channel: 'local' })).toBe(false)
  })

  it('applies exclude phrase at entry granularity', () => {
    expect(entryMatchesFilters(entry, { excludePhrase: 'deprecated' })).toBe(true)
    expect(entryMatchesFilters(entry, { excludePhrase: 'connection refused' })).toBe(false)
  })
})
