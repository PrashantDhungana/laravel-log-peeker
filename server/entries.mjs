import { open } from 'node:fs/promises'

export const HEADER_RE =
  /^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?)\]\s+([^\s.]+)\.([A-Z]+):\s*(.*)$/

export const MAX_ENTRY_BYTES = 256 * 1024
const PROBE_SIZE = 8192

/** @param {string} ts */
export function parseTimestamp(ts) {
  const normalised = ts.includes('T') ? ts : ts.replace(' ', 'T')
  const ms = Date.parse(normalised)
  return Number.isNaN(ms) ? null : ms
}

/** @param {string} line */
export function parseHeaderLine(line) {
  const m = line.match(HEADER_RE)
  if (!m) return null
  return {
    time: parseTimestamp(m[1]),
    channel: m[2],
    level: m[3],
    message: m[4]?.trim() ?? '',
  }
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} offset
 * @param {number} fileSize
 */
async function headerOffsetIfPresent(fd, offset, fileSize) {
  if (offset >= fileSize) return null
  if (offset > 0) {
    const prev = Buffer.alloc(1)
    await fd.read(prev, 0, 1, offset - 1)
    if (prev[0] !== 0x0a) return null
  }
  const buf = Buffer.alloc(Math.min(512, fileSize - offset))
  await fd.read(buf, 0, buf.length, offset)
  const nl = buf.indexOf(0x0a)
  const line = buf.subarray(0, nl >= 0 ? nl : buf.length).toString('utf8')
  return HEADER_RE.test(line) ? offset : null
}

/** @param {Buffer} buf @param {number} baseOffset */
export function findHeaderLineStarts(buf, baseOffset) {
  const starts = []
  if (buf.length === 0) return starts
  if (buf[0] === 0x5b) {
    const nl = buf.indexOf(0x0a)
    const line = buf.subarray(0, nl >= 0 ? nl : Math.min(buf.length, 512)).toString('utf8')
    if (HEADER_RE.test(line)) starts.push(baseOffset)
  }
  for (let i = 1; i < buf.length; i++) {
    if (buf[i - 1] === 0x0a && buf[i] === 0x5b) {
      const nl = buf.indexOf(0x0a, i)
      const end = nl >= 0 ? nl : buf.length
      const line = buf.subarray(i, Math.min(i + 512, end)).toString('utf8')
      if (HEADER_RE.test(line)) starts.push(baseOffset + i)
      else if (nl < 0 && /^\[\d{4}-\d{2}-\d{2}[ T]/.test(line)) starts.push(baseOffset + i)
    }
  }
  return starts
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} offset
 * @param {number} fileSize
 */
export async function findEntryStartOffset(fd, offset, fileSize) {
  const direct = await headerOffsetIfPresent(fd, offset, fileSize)
  if (direct !== null) return direct

  let pos = Math.max(0, Math.min(offset, fileSize - 1))
  const minPos = Math.max(0, pos - MAX_ENTRY_BYTES)

  while (pos > minPos) {
    const readStart = Math.max(0, pos - PROBE_SIZE)
    const buf = Buffer.alloc(Math.min(PROBE_SIZE, pos - readStart + 1))
    await fd.read(buf, 0, buf.length, readStart)
    const localStarts = findHeaderLineStarts(buf, readStart)
    for (let i = localStarts.length - 1; i >= 0; i--) {
      if (localStarts[i] <= pos) return localStarts[i]
    }
    if (readStart === 0) break
    pos = readStart
  }

  if (offset === 0) return 0
  return null
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} entryStart
 * @param {number} fileSize
 */
export async function findEntryEndOffset(fd, entryStart, fileSize) {
  let scanFrom = entryStart + 1
  const maxScan = Math.min(fileSize, entryStart + MAX_ENTRY_BYTES)

  while (scanFrom < maxScan) {
    const readLen = Math.min(PROBE_SIZE, maxScan - scanFrom)
    const buf = Buffer.alloc(readLen)
    await fd.read(buf, 0, readLen, scanFrom)
    for (let i = 1; i < buf.length; i++) {
      if (buf[i - 1] === 0x0a && buf[i] === 0x5b) {
        const nl = buf.indexOf(0x0a, i)
        const end = nl >= 0 ? nl : buf.length
        const line = buf.subarray(i, Math.min(i + 512, end)).toString('utf8')
        if (HEADER_RE.test(line)) return scanFrom + i
        if (nl < 0 && /^\[\d{4}-\d{2}-\d{2}[ T]/.test(line)) return scanFrom + i
      }
    }
    scanFrom += readLen
  }

  return Math.min(fileSize, entryStart + MAX_ENTRY_BYTES)
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} matchOffset
 * @param {number} fileSize
 */
export async function resolveEntry(fd, matchOffset, fileSize) {
  const start = await findEntryStartOffset(fd, matchOffset, fileSize)
  if (start === null) return null
  const end = await findEntryEndOffset(fd, start, fileSize)
  const length = end - start
  const readLen = Math.min(length, MAX_ENTRY_BYTES)
  const buf = Buffer.alloc(readLen)
  await fd.read(buf, 0, readLen, start)
  const text = buf.toString('utf8')
  const firstLine = text.split('\n')[0] ?? ''
  const header = parseHeaderLine(firstLine)
  if (!header) return null
  return {
    offset: start,
    length,
    truncated: length > MAX_ENTRY_BYTES,
    ...header,
    preview: header.message.slice(0, 200),
    body: text,
  }
}

/** @param {string} path @param {number} offset @param {number} length */
export async function readEntryAt(path, offset, length) {
  const fd = await open(path, 'r')
  try {
    const readLen = Math.min(length, MAX_ENTRY_BYTES)
    const buf = Buffer.alloc(readLen)
    await fd.read(buf, 0, readLen, offset)
    return {
      body: buf.toString('utf8'),
      truncated: length > MAX_ENTRY_BYTES,
    }
  } finally {
    await fd.close()
  }
}

/** @param {ReturnType<typeof resolveEntry> extends Promise<infer T> ? NonNullable<T> : never} entry */
function toNeighborEntry(entry) {
  return {
    offset: entry.offset,
    length: entry.length,
    time: entry.time,
    level: entry.level,
    channel: entry.channel,
    message: entry.preview,
    body: entry.body,
    truncated: entry.truncated,
  }
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} beforeOffset
 * @param {number} fileSize
 * @param {number} count
 */
export async function readEntriesAbove(fd, beforeOffset, fileSize, count) {
  /** @type {ReturnType<typeof toNeighborEntry>[]} */
  const entries = []
  let probe = beforeOffset

  for (let i = 0; i < count && probe > 0; i++) {
    const prevStart = await findEntryStartOffset(fd, probe - 1, fileSize)
    if (prevStart === null || prevStart >= probe) break
    const entry = await resolveEntry(fd, prevStart, fileSize)
    if (!entry) break
    entries.unshift(toNeighborEntry(entry))
    probe = prevStart
  }

  let hasMore = false
  if (entries.length > 0) {
    const earlier = await findEntryStartOffset(fd, entries[0].offset - 1, fileSize)
    hasMore = earlier !== null && earlier < entries[0].offset
  } else if (beforeOffset > 0) {
    hasMore = true
  }

  return { entries, hasMore }
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} afterOffset
 * @param {number} fileSize
 * @param {number} count
 */
export async function readEntriesBelow(fd, afterOffset, fileSize, count) {
  /** @type {ReturnType<typeof toNeighborEntry>[]} */
  const entries = []
  let probe = afterOffset

  for (let i = 0; i < count && probe < fileSize; i++) {
    const entry = await resolveEntry(fd, probe, fileSize)
    if (!entry) break
    entries.push(toNeighborEntry(entry))
    probe = entry.offset + entry.length
  }

  return { entries, hasMore: probe < fileSize }
}

/**
 * @param {string} path
 * @param {object} opts
 * @param {number} [opts.beforeOffset]
 * @param {number} [opts.afterOffset]
 * @param {number} [opts.count]
 */
export async function readNeighbors(path, { beforeOffset, afterOffset, count = 3 }) {
  const fd = await open(path, 'r')
  try {
    const { size } = await fd.stat()
    const result = {}

    if (beforeOffset !== undefined && beforeOffset !== null) {
      result.above = await readEntriesAbove(fd, beforeOffset, size, count)
    }
    if (afterOffset !== undefined && afterOffset !== null) {
      result.below = await readEntriesBelow(fd, afterOffset, size, count)
    }

    return result
  } finally {
    await fd.close()
  }
}
