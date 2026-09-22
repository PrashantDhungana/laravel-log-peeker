import { describe, expect, it } from 'vitest'
import { timeRangeForFiles } from './files'
import type { FileInfo } from '../api'

const files: FileInfo[] = [
  {
    path: '/a.log',
    size: 100,
    format: 'laravelLine',
    firstTime: 1000,
    lastTime: 5000,
    firstOffset: 0,
    lastOffset: 90,
  },
  {
    path: '/b.log',
    size: 200,
    format: 'laravelLine',
    firstTime: 3000,
    lastTime: 9000,
    firstOffset: 0,
    lastOffset: 190,
  },
]

describe('timeRangeForFiles', () => {
  it('returns the combined span for all selected files', () => {
    expect(timeRangeForFiles(files, ['/a.log', '/b.log'])).toEqual({
      firstTime: 1000,
      lastTime: 9000,
    })
  })

  it('narrows to a single selected file', () => {
    expect(timeRangeForFiles(files, ['/b.log'])).toEqual({
      firstTime: 3000,
      lastTime: 9000,
    })
  })

  it('returns nulls when nothing is selected', () => {
    expect(timeRangeForFiles(files, [])).toEqual({
      firstTime: null,
      lastTime: null,
    })
  })
})
