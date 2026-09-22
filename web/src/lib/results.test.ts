import { describe, expect, it } from 'vitest'
import type { SearchEntry } from '../api'
import { mergeFileResults } from './results'

function entry(path: string, offset: number): SearchEntry {
  return {
    type: 'entry',
    path,
    offset,
    length: 10,
    time: offset,
    level: 'INFO',
    channel: 'app',
    message: `entry ${offset}`,
    truncated: false,
  }
}

describe('mergeFileResults', () => {
  it('appends new entries after the last row for the same file', () => {
    const previous = [entry('a.log', 1), entry('b.log', 2), entry('a.log', 3)]
    const merged = mergeFileResults(previous, 'a.log', [entry('a.log', 4), entry('a.log', 5)])
    expect(merged.map((e) => e.offset)).toEqual([1, 2, 3, 4, 5])
  })

  it('skips duplicate offsets', () => {
    const previous = [entry('a.log', 1)]
    const merged = mergeFileResults(previous, 'a.log', [entry('a.log', 1), entry('a.log', 2)])
    expect(merged.map((e) => e.offset)).toEqual([1, 2])
  })
})
