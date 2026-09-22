import { describe, expect, it } from 'vitest'
import { readNeighbors } from './entries.mjs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sample = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'sample.log')

describe('readNeighbors', () => {
  it('reads entries above and below a focal entry', async () => {
    const { above, below } = await readNeighbors(sample, {
      beforeOffset: 163,
      afterOffset: 464,
      count: 2,
    })

    expect(above.entries).toHaveLength(2)
    expect(above.entries[0].message).toContain('Application started')
    expect(above.entries[1].message).toContain('Disk space low')
    expect(above.hasMore).toBe(true)

    expect(below.entries).toHaveLength(2)
    expect(below.entries[0].message).toContain('Duplicate error')
    expect(below.entries[1].message).toContain('Deploy complete')
    expect(below.entries[0].offset).toBe(464)
    expect(below.hasMore).toBe(true)
  })

  it('pages further above', async () => {
    const first = await readNeighbors(sample, { beforeOffset: 163, count: 2 })
    const second = await readNeighbors(sample, {
      beforeOffset: first.above.entries[0].offset,
      count: 2,
    })
    expect(second.above.entries[0].message).toContain('First entry')
  })
})
