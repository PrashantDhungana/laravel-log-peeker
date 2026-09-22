import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openFilesInfo, mergeFacets, searchMultiFiles } from './multi.mjs'

const sample = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample.log')

describe('multi file support', () => {
  it('opens multiple files and merges summary', async () => {
    const { files, summary } = await openFilesInfo([sample, sample])
    expect(files).toHaveLength(2)
    expect(summary.fileCount).toBe(2)
    expect(summary.totalSize).toBe(files[0].size * 2)
  })

  it('merges facets across files', async () => {
    const facets = await mergeFacets([sample, sample])
    expect(facets.entryCount).toBe(14)
    expect(facets.levels.find((l) => l.name === 'ERROR')?.count).toBe(4)
  })

  it('searches multiple files and tags results with path', async () => {
    const { entries, hasMore } = await searchMultiFiles([sample, sample], {}, 10, null)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.path === sample)).toBe(true)
    expect(entries.every((e) => e.fileName)).toBeTruthy()
    expect(typeof hasMore).toBe('boolean')
  })
})
