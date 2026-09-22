import { describe, expect, it } from 'vitest'
import { open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { byteRangeForTimeFilter, firstEntryAtOrAfter, offsetForTime, openFileInfo } from './logfile.mjs'
import { parseTimestamp } from './entries.mjs'

function makeSortedLog(count) {
  const lines = []
  const base = Date.parse('2026-03-01T00:00:00')
  for (let i = 0; i < count; i++) {
    const d = new Date(base + i * 3_600_000)
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00:00`
    lines.push(`[${ts}] production.INFO: entry ${i}`)
  }
  return lines.join('\n') + '\n'
}

describe('openFileInfo', () => {
  it('reads first and last entry times from head and tail', async () => {
    const file = join(tmpdir(), `peeker-open-${Date.now()}.log`)
    await writeFile(file, makeSortedLog(500), 'utf8')
    const info = await openFileInfo(file)
    expect(info.format).toBe('laravelLine')
    expect(info.firstTime).not.toBeNull()
    expect(info.lastTime).not.toBeNull()
    expect(info.lastTime).toBeGreaterThan(info.firstTime)
  })
})

describe('offsetForTime', () => {
  it('binary-searches to the correct byte offset', async () => {
    const content = makeSortedLog(2000)
    expect(content.length).toBeGreaterThan(65536)
    const file = join(tmpdir(), `peeker-bsearch-${Date.now()}.log`)
    await writeFile(file, content, 'utf8')
    const fd = await open(file, 'r')
    try {
      const targetLine = content.split('\n')[1000]
      const ts = targetLine.match(/\[([^\]]+)\]/)?.[1]
      const targetMs = parseTimestamp(ts)
      const offset = await offsetForTime(fd, content.length, targetMs)
      const entry = await firstEntryAtOrAfter(fd, offset, content.length)
      expect(entry?.time).toBeGreaterThanOrEqual(targetMs)
      expect(entry?.offset).toBe(content.indexOf(targetLine))
    } finally {
      await fd.close()
    }
  })

  it('returns byte range for time filter', async () => {
    const content = makeSortedLog(2000)
    const file = join(tmpdir(), `peeker-range-${Date.now()}.log`)
    await writeFile(file, content, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    const startMs = parseTimestamp(lines[800].match(/\[([^\]]+)\]/)?.[1])
    const endMs = parseTimestamp(lines[900].match(/\[([^\]]+)\]/)?.[1])
    const { start, end } = await byteRangeForTimeFilter(file, startMs, endMs)
    const slice = content.slice(start, end)
    expect(slice).toContain(lines[800].slice(0, 24))
    expect(slice).toContain(lines[900].slice(0, 24))
    expect(slice).not.toContain(lines[799].slice(0, 24))
  })
})
