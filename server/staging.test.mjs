import { describe, expect, it } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { safeFilename, stageFileStream, STAGING_ROOT } from './staging.mjs'

describe('staging', () => {
  it('sanitises filenames', () => {
    expect(safeFilename('../../../etc/passwd')).toBe('passwd')
    expect(safeFilename('laravel.log')).toBe('laravel.log')
  })

  it('writes uploaded streams to a local staging path', async () => {
    const content = '[2026-01-01 00:00:00] local.INFO: staged upload\n'
    const path = await stageFileStream('sample.log', Readable.from([content]))
    try {
      expect(path.startsWith(STAGING_ROOT)).toBe(true)
      expect(await readFile(path, 'utf8')).toBe(content)
    } finally {
      await rm(path, { force: true })
    }
  })
})
