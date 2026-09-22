import { describe, expect, it } from 'vitest'
import { open, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { openFileInfo, byteRangeForTimeFilter } from './logfile.mjs'
import { buildRgArgs } from './query.mjs'
import { runRgOnRange } from './rg.mjs'
import { resolveEntry } from './entries.mjs'

/** Generate a ~8 MB sorted log (scaled proxy for multi-GB behaviour). */
function makeLargeLog(entryCount) {
  const lines = []
  const base = Date.parse('2026-03-01T00:00:00')
  for (let i = 0; i < entryCount; i++) {
    const d = new Date(base + i * 60_000)
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
    lines.push(`[${ts}] production.INFO: routine heartbeat ${i}`)
  }
  return lines.join('\n') + '\n'
}

describe('performance smoke', () => {
  it('meets open and search latency targets on a large sorted fixture', async () => {
    const content = makeLargeLog(80_000)
    const file = join(tmpdir(), `peeker-perf-${Date.now()}.log`)
    await writeFile(file, content, 'utf8')

    const t0 = performance.now()
    const info = await openFileInfo(file)
    const openMs = performance.now() - t0
    expect(openMs).toBeLessThan(100)

    const t1 = performance.now()
    const { start, end } = await byteRangeForTimeFilter(file, info.firstTime, info.lastTime)
    const rangeMs = performance.now() - t1
    expect(rangeMs).toBeLessThan(50)

    const { args } = buildRgArgs({ phrase: 'heartbeat 12345', caseSensitive: false })
    const matches = []
    const t2 = performance.now()
    await runRgOnRange({
      path: file,
      rangeStart: start,
      rangeEnd: end,
      args,
      onMatch: (m) => matches.push(m),
      limit: 5,
    })
    const searchMs = performance.now() - t2
    expect(searchMs).toBeLessThan(1000)
    expect(matches.length).toBeGreaterThan(0)

    const fd = await open(file, 'r')
    try {
      const entry = await resolveEntry(fd, matches[0].fileOffset, info.size)
      expect(entry).not.toBeNull()
    } finally {
      await fd.close()
    }
  }, 30_000)
})
