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

/** @param {Buffer} buf @param {number} baseOffset */
export function findHeaderLineStarts(buf, baseOffset) {
  const starts = []
  if (buf.length === 0) return starts
  if (buf[0] === 0x5b) {
    const nl = buf.indexOf(0x0a)
    const line = buf.subarray(0, nl >= 0 ? nl : Math.min(buf.length, 512)).toString('utf8')
    if (HEADER_RE.test(line)) starts.push(baseOffset)
  }
  for (let i = 1; i < buf.length - 20; i++) {
    if (buf[i - 1] === 0x0a && buf[i] === 0x5b) {
      const nl = buf.indexOf(0x0a, i)
      const end = nl >= 0 ? nl : Math.min(i + 512, buf.length)
      const line = buf.subarray(i, end).toString('utf8')
      if (HEADER_RE.test(line)) starts.push(baseOffset + i)
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
    for (let i = 1; i < buf.length - 20; i++) {
      if (buf[i - 1] === 0x0a && buf[i] === 0x5b) {
        const nl = buf.indexOf(0x0a, i)
        const end = nl >= 0 ? nl : Math.min(i + 512, buf.length)
        const line = buf.subarray(i, end).toString('utf8')
        if (HEADER_RE.test(line)) return scanFrom + i
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
