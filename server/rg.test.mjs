import { describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getRgPath, runRgOnRange } from './rg.mjs'

describe('runRgOnRange', () => {
  it('resolves rg binary', () => {
    expect(getRgPath()).toBeTruthy()
  })

  it('translates absolute_offset to true file offsets', async () => {
    const prefix = 'AAAA\nBBBB\n'
    const target = 'TARGET_LINE\n'
    const suffix = 'CCCC\n'
    const content = prefix + target + suffix
    const file = join(tmpdir(), `peeker-rg-${Date.now()}.log`)
    await writeFile(file, content, 'utf8')

    const rangeStart = prefix.length - 2
    const matches = []
    await runRgOnRange({
      path: file,
      rangeStart,
      rangeEnd: content.length,
      args: ['-F', '-e', 'TARGET_LINE'],
      onMatch: (m) => matches.push(m),
      limit: 10,
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].fileOffset).toBe(content.indexOf('TARGET_LINE'))
    expect(matches[0].lineText).toContain('TARGET_LINE')
  })
})
