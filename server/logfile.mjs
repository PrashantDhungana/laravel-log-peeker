import { open, stat } from 'node:fs/promises'
import { findHeaderLineStarts, parseHeaderLine } from './entries.mjs'

const HEAD_TAIL = 64 * 1024
const PROBE = 64 * 1024

/** @param {import('node:fs/promises').FileHandle} fd @param {number} pos @param {number} fileSize */
async function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len)
  await fd.read(buf, 0, len, pos)
  return buf
}

/** @param {Buffer} buf @param {number} baseOffset */
function firstHeaderInBuffer(buf, baseOffset) {
  const starts = findHeaderLineStarts(buf, baseOffset)
  if (starts.length === 0) return null
  const offset = starts[0]
  const local = offset - baseOffset
  const nl = buf.indexOf(0x0a, local)
  const line = buf.subarray(local, nl >= 0 ? nl : buf.length).toString('utf8')
  const header = parseHeaderLine(line)
  if (!header) return null
  return { offset, ...header }
}

/** @param {Buffer} buf @param {number} baseOffset */
function lastHeaderInBuffer(buf, baseOffset) {
  const starts = findHeaderLineStarts(buf, baseOffset)
  if (starts.length === 0) return null
  const offset = starts[starts.length - 1]
  const local = offset - baseOffset
  const nl = buf.indexOf(0x0a, local)
  const line = buf.subarray(local, nl >= 0 ? nl : buf.length).toString('utf8')
  const header = parseHeaderLine(line)
  if (!header) return null
  return { offset, ...header }
}

/** @param {string} path */
export async function openFileInfo(path) {
  const st = await stat(path)
  if (!st.isFile()) throw new Error('Path is not a file')

  const fd = await open(path, 'r')
  try {
    const size = st.size
    let format = 'plain'
    let first = null
    let last = null

    if (size > 0) {
      const headLen = Math.min(HEAD_TAIL, size)
      const head = await readAt(fd, 0, headLen)
      first = firstHeaderInBuffer(head, 0)

      const tailLen = Math.min(HEAD_TAIL, size)
      const tailStart = size - tailLen
      const tail = await readAt(fd, tailStart, tailLen)
      last = lastHeaderInBuffer(tail, tailStart)

      const sample = head.toString('utf8', 0, Math.min(headLen, 8192))
      if (first) format = 'laravelLine'
      else if (sample.split('\n').some((l) => l.startsWith('{') && l.includes('"message"'))) format = 'jsonLines'
    }

    return {
      path,
      size,
      format,
      firstTime: first?.time ?? null,
      lastTime: last?.time ?? null,
      firstOffset: first?.offset ?? 0,
      lastOffset: last?.offset ?? 0,
    }
  } finally {
    await fd.close()
  }
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} pos
 * @param {number} fileSize
 */
export async function firstEntryAtOrAfter(fd, pos, fileSize) {
  if (pos >= fileSize) return null
  const readLen = Math.min(PROBE, fileSize - pos)
  const buf = await readAt(fd, pos, readLen)
  const entry = firstHeaderInBuffer(buf, pos)
  if (entry) return entry

  let scan = pos + readLen
  while (scan < fileSize) {
    const len = Math.min(PROBE, fileSize - scan)
    const chunk = await readAt(fd, scan, len)
    const found = firstHeaderInBuffer(chunk, scan)
    if (found) return found
    scan += len
  }
  return null
}

/**
 * @param {import('node:fs/promises').FileHandle} fd
 * @param {number} fileSize
 * @param {number|null} targetMs
 */
export async function offsetForTime(fd, fileSize, targetMs) {
  if (targetMs === null || targetMs === undefined) return 0
  let lo = 0
  let hi = fileSize

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const entry = await firstEntryAtOrAfter(fd, mid, fileSize)
    if (!entry || entry.time === null || entry.time >= targetMs) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

/**
 * @param {string} path
 * @param {number|null} timeStart
 * @param {number|null} timeEnd
 */
export async function byteRangeForTimeFilter(path, timeStart, timeEnd) {
  const fd = await open(path, 'r')
  try {
    const { size } = await stat(path)
    const start = await offsetForTime(fd, size, timeStart)
    let end = size
    if (timeEnd !== null && timeEnd !== undefined) {
      end = await offsetForTime(fd, size, timeEnd + 1)
      if (end < size) {
        const entry = await firstEntryAtOrAfter(fd, end, size)
        if (entry) {
          const next = await firstEntryAtOrAfter(fd, entry.offset + 1, size)
          end = next ? next.offset : size
        }
      }
    }
    return { start, end: Math.max(start, end) }
  } finally {
    await fd.close()
  }
}
