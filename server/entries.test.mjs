import { describe, expect, it } from 'vitest'
import { open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  HEADER_RE,
  findEntryEndOffset,
  findEntryStartOffset,
  parseHeaderLine,
  parseTimestamp,
  resolveEntry,
} from './entries.mjs'

describe('parseHeaderLine', () => {
  it('parses Laravel line format', () => {
    const line = '[2026-02-15 14:22:01] production.ERROR: SQLSTATE connection refused'
    const header = parseHeaderLine(line)
    expect(header).not.toBeNull()
    expect(header?.channel).toBe('production')
    expect(header?.level).toBe('ERROR')
    expect(header?.message).toContain('SQLSTATE')
  })

  it('parses ISO timestamp with T separator', () => {
    const line = '[2026-02-15T14:22:01.123+00:00] local.INFO: hello'
    const header = parseHeaderLine(line)
    expect(header?.level).toBe('INFO')
    expect(parseTimestamp('2026-02-15T14:22:01.123+00:00')).not.toBeNull()
  })

  it('returns null for non-header lines', () => {
    expect(parseHeaderLine('#0 /app/vendor/laravel/framework.php(123)')).toBeNull()
    expect(HEADER_RE.test('[invalid] not a header')).toBe(false)
  })
})

describe('entry boundary resolution', () => {
  it('resolves entry from mid-stack offset', async () => {
    const body = `[2026-02-15 14:22:01] production.ERROR: boom
Stack trace:
#0 /app/example.php(1): fail()
#1 /app/index.php(2): run()
[2026-03-01 09:00:00] production.INFO: next entry
`
    const file = join(tmpdir(), `peeker-entry-${Date.now()}.log`)
    await writeFile(file, body, 'utf8')
    const fd = await open(file, 'r')
    try {
      const stackLineOffset = body.indexOf('#1 /app/index.php')
      const start = await findEntryStartOffset(fd, stackLineOffset, body.length)
      expect(start).toBe(0)
      const end = await findEntryEndOffset(fd, start, body.length)
      expect(end).toBe(body.indexOf('[2026-03-01'))
      const entry = await resolveEntry(fd, stackLineOffset, body.length)
      expect(entry?.level).toBe('ERROR')
      expect(entry?.body).toContain('Stack trace')
      expect(entry?.body).not.toContain('next entry')
    } finally {
      await fd.close()
    }
  })
})
