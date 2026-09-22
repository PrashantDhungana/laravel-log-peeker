import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectFacets } from './facets.mjs'

const sample = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample.log')

describe('collectFacets', () => {
  it('returns levels and channels present in the log', async () => {
    const facets = await collectFacets(sample)
    expect(facets.entryCount).toBe(7)
    expect(facets.levels.map((l) => l.name)).toEqual([
      'DEBUG',
      'INFO',
      'WARNING',
      'ERROR',
      'CRITICAL',
    ])
    expect(facets.channels.map((c) => c.name)).toEqual(['local', 'production', 'staging'])
    expect(facets.levels.find((l) => l.name === 'ERROR')?.count).toBe(2)
  })
})
