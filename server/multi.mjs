import { open, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { openFileInfo, byteRangeForTimeFilter } from './logfile.mjs'
import { resolveEntry } from './entries.mjs'
import { buildRgArgs, entryMatchesFilters } from './query.mjs'
import { runRgOnRange, runRgCount } from './rg.mjs'
import { collectFacets } from './facets.mjs'

/** @param {unknown} body */
export function normalizePaths(body) {
  if (Array.isArray(body.paths) && body.paths.length > 0) {
    return [...new Set(body.paths.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim()))]
  }
  if (typeof body.path === 'string' && body.path.trim()) {
    return [body.path.trim()]
  }
  return null
}

/** @param {string[]} paths */
export async function openFilesInfo(paths) {
  const files = await Promise.all(paths.map((path) => openFileInfo(path)))
  const firstTimes = files.map((f) => f.firstTime).filter((t) => t !== null)
  const lastTimes = files.map((f) => f.lastTime).filter((t) => t !== null)
  return {
    files,
    summary: {
      fileCount: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      firstTime: firstTimes.length ? Math.min(...firstTimes) : null,
      lastTime: lastTimes.length ? Math.max(...lastTimes) : null,
    },
  }
}

/** @param {string[]} paths */
export async function mergeFacets(paths) {
  const levelCounts = new Map()
  const channelCounts = new Map()
  let entryCount = 0

  for (const path of paths) {
    const facets = await collectFacets(path)
    entryCount += facets.entryCount
    for (const { name, count } of facets.levels) {
      levelCounts.set(name, (levelCounts.get(name) ?? 0) + count)
    }
    for (const { name, count } of facets.channels) {
      channelCounts.set(name, (channelCounts.get(name) ?? 0) + count)
    }
  }

  const LEVEL_ORDER = [
    'DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY',
  ]

  return {
    levels: [...levelCounts.entries()]
      .sort((a, b) => {
        const ai = LEVEL_ORDER.indexOf(a[0])
        const bi = LEVEL_ORDER.indexOf(b[0])
        if (ai === -1 && bi === -1) return a[0].localeCompare(b[0])
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
      .map(([name, count]) => ({ name, count })),
    channels: [...channelCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count })),
    entryCount,
  }
}

/** @param {string[]} paths @param {object} filters */
export async function countMultiFiles(paths, filters) {
  const { args } = buildRgArgs(filters)
  let total = 0
  for (const path of paths) {
    const { start, end } = await byteRangeForTimeFilter(path, filters.timeStart, filters.timeEnd)
    total += await runRgCount({ path, rangeStart: start, rangeEnd: end, args })
  }
  return total
}

/**
 * @param {object} entry
 * @param {string} path
 */
function toSearchEntry(entry, path) {
  return {
    type: 'entry',
    path,
    fileName: basename(path),
    offset: entry.offset,
    length: entry.length,
    time: entry.time,
    level: entry.level,
    channel: entry.channel,
    message: entry.preview,
    truncated: entry.truncated,
  }
}

/**
 * @param {string[]} paths
 * @param {object} filters
 * @param {number} limit
 * @param {object|null|undefined} cursorState
 */
export async function searchMultiFiles(paths, filters, limit, cursorState) {
  /** @type {Record<string, number>} */
  const byPath = { ...(cursorState?.byPath ?? {}) }
  /** @type {ReturnType<typeof toSearchEntry>[]} */
  let buffer = [...(cursorState?.buffer ?? [])]
  buffer.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))

  /** @type {ReturnType<typeof toSearchEntry>[]} */
  const emitted = []
  while (emitted.length < limit && buffer.length > 0) {
    emitted.push(buffer.shift())
  }

  const { mode, args } = buildRgArgs(filters)
  const filterOpts = {
    timeStart: filters.timeStart,
    timeEnd: filters.timeEnd,
    excludePhrase: filters.excludePhrase,
    caseSensitive: filters.caseSensitive,
    levels: filters.levels,
    channel: filters.channel,
  }

  const maxRgMatches = limit * 15

  while (emitted.length < limit) {
    /** @type {ReturnType<typeof toSearchEntry>[]} */
    const batch = []
    let fileHadMore = false

    for (const path of paths) {
      const { start, end } = await byteRangeForTimeFilter(path, filters.timeStart, filters.timeEnd)
      const scanStart = byPath[path] ?? start
      if (scanStart >= end) continue

      fileHadMore = true

      /** @type {number[]} */
      const matchOffsets = []
      let lastMatchOffset = scanStart

      await runRgOnRange({
        path,
        rangeStart: scanStart,
        rangeEnd: end,
        args,
        onMatch: ({ fileOffset }) => {
          matchOffsets.push(fileOffset)
          lastMatchOffset = fileOffset
        },
        limit: maxRgMatches,
      })

      if (matchOffsets.length >= maxRgMatches) {
        byPath[path] = lastMatchOffset + 1
      } else {
        byPath[path] = end
      }

      const fd = await open(path, 'r')
      try {
        const st = await stat(path)
        const seen = new Set()
        for (const fileOffset of matchOffsets) {
          const entry = await resolveEntry(fd, fileOffset, st.size)
          if (!entry) continue
          const key = `${entry.offset}:${entry.length}`
          if (seen.has(key)) continue
          seen.add(key)
          if (!entryMatchesFilters(entry, filterOpts)) continue
          batch.push(toSearchEntry(entry, path))
        }
      } finally {
        await fd.close()
      }
    }

    if (batch.length === 0) break

    batch.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
    buffer = [...buffer, ...batch].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))

    while (emitted.length < limit && buffer.length > 0) {
      emitted.push(buffer.shift())
    }

    if (!fileHadMore && buffer.length === 0) break
    if (batch.length === 0 && !fileHadMore) break
  }

  const hasMore =
    buffer.length > 0 ||
    (await Promise.all(
      paths.map(async (path) => {
        const { start, end } = await byteRangeForTimeFilter(path, filters.timeStart, filters.timeEnd)
        return (byPath[path] ?? start) < end
      }),
    )).some(Boolean)

  return {
    mode,
    entries: emitted,
    hasMore,
    nextCursor: hasMore ? { byPath, buffer } : null,
  }
}
