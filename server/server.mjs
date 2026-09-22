import { createServer } from 'node:http'
import { open, stat } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { basename, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { openFileInfo, byteRangeForTimeFilter } from './logfile.mjs'
import { resolveEntry, readEntryAt, readNeighbors } from './entries.mjs'
import { buildRgArgs, entryMatchesFilters } from './query.mjs'
import { runRgOnRange, runRgCount } from './rg.mjs'
import { collectFacets } from './facets.mjs'
import { normalizePaths, openFilesInfo, mergeFacets, searchMultiFiles, countMultiFiles } from './multi.mjs'
import { stageFileStream } from './staging.mjs'
import { pickLogFilesWindows } from './picker.mjs'
import {
  applyDevCors,
  attachSocketSafety,
  bindClientGuard,
  readJsonBody,
  sendError,
  sendJson,
  sendStreamError,
} from './util.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const WEB_DIST = join(__dirname, '..', 'web-dist')
const PAGE_SIZE = 100

let socketExceptionGuardInstalled = false

function installSocketExceptionGuard() {
  if (socketExceptionGuardInstalled) return
  socketExceptionGuardInstalled = true
  process.on('uncaughtException', (err) => {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = err.code
      if (code === 'EOF' || code === 'ECONNRESET' || code === 'EPIPE') return
    }
    console.error(err)
    process.exit(1)
  })
}

/**
 * @param {object} opts
 * @param {number} [opts.port]
 * @param {string} [opts.token]
 * @param {boolean} [opts.openBrowser]
 */
export async function startServer({ port = 3847, token = randomBytes(16).toString('hex'), openBrowser = false } = {}) {
  installSocketExceptionGuard()

  const server = createServer(async (req, res) => {
    const guard = bindClientGuard(req, res)
    try {
      if (applyDevCors(req, res)) return

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
      const host = req.headers.host ?? ''
      if (!host.startsWith('127.0.0.1') && !host.startsWith('localhost')) {
        sendError(res, 403, 'Invalid Host')
        return
      }

      if (url.pathname.startsWith('/api/')) {
        const headerToken = req.headers['x-peeker-token']
        const reqToken = (typeof headerToken === 'string' ? headerToken : headerToken?.[0]) ??
          url.searchParams.get('token')
        if (reqToken !== token) {
          sendError(res, 401, 'Unauthorized')
          return
        }
        await handleApi(req, res, url, guard)
        return
      }

      serveStatic(req, res, url.pathname)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (res.headersSent) sendStreamError(res, msg, guard)
      else sendError(res, 500, msg)
    }
  })

  server.on('connection', (socket) => attachSocketSafety(socket))

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${port}?token=${token}`
  return { server, port, token, baseUrl, openBrowser }
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {URL} url @param {ReturnType<typeof bindClientGuard>} guard */
async function handleApi(req, res, url, guard) {
  if (req.method === 'POST' && url.pathname === '/api/open') {
    const body = await readJsonBody(req)
    const paths = normalizePaths(body)
    if (!paths?.length) {
      sendError(res, 400, 'path or paths required')
      return
    }
    try {
      const info = await openFilesInfo(paths)
      sendJson(res, info)
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/search') {
    await handleSearch(req, res, guard)
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/entry') {
    const path = url.searchParams.get('path')
    const offset = parseInt(url.searchParams.get('offset') ?? '', 10)
    const length = parseInt(url.searchParams.get('length') ?? '', 10)
    if (!path || Number.isNaN(offset) || Number.isNaN(length)) {
      sendError(res, 400, 'path, offset, length required')
      return
    }
    try {
      const entry = await readEntryAt(path, offset, length)
      sendJson(res, entry)
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/count') {
    await handleCount(req, res, guard)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/facets') {
    const body = await readJsonBody(req)
    const paths = normalizePaths(body)
    if (!paths?.length) {
      sendError(res, 400, 'path or paths required')
      return
    }
    try {
      const facets =
        paths.length === 1 ? await collectFacets(paths[0]) : await mergeFacets(paths)
      if (guard.isClosed()) return
      sendJson(res, facets, guard)
    } catch (err) {
      if (guard.signal.aborted) return
      sendError(res, 400, err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (req.method === 'PUT' && url.pathname === '/api/stage') {
    const rawName = req.headers['x-filename']
    const filename =
      typeof rawName === 'string'
        ? decodeURIComponent(rawName)
        : Array.isArray(rawName)
          ? decodeURIComponent(rawName[0] ?? 'upload.log')
          : 'upload.log'
    try {
      const path = await stageFileStream(filename, req)
      sendJson(res, { path, staged: true })
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/pick') {
    try {
      const paths = await pickLogFilesWindows()
      sendJson(res, { paths })
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err))
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/neighbors') {
    const body = await readJsonBody(req)
    const { path, beforeOffset, afterOffset, count = 3 } = body
    if (!path) {
      sendError(res, 400, 'path required')
      return
    }
    if (beforeOffset === undefined && afterOffset === undefined) {
      sendError(res, 400, 'beforeOffset or afterOffset required')
      return
    }
    try {
      const neighbors = await readNeighbors(path, {
        beforeOffset,
        afterOffset,
        count: Math.min(Math.max(1, count), 20),
      })
      sendJson(res, neighbors)
    } catch (err) {
      sendError(res, 400, err instanceof Error ? err.message : String(err))
    }
    return
  }

  sendError(res, 404, 'Not found')
}

/** @param {string} pattern @param {string} flags */
function validateRegex(pattern, flags) {
  try {
    new RegExp(pattern, flags.replace(/[^gimsuy]/g, ''))
  } catch (err) {
    throw new Error(`Invalid regex: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {ReturnType<typeof bindClientGuard>} guard */
async function handleSearch(req, res, guard) {
  /** @type {import('node:fs/promises').FileHandle | null} */
  let fd = null

  try {
    const body = await readJsonBody(req)
    const paths = normalizePaths(body)
    const {
      timeStart = null,
      timeEnd = null,
      phrase = '',
      excludePhrase = '',
      regex = '',
      regexFlags = 'i',
      caseSensitive = false,
      levels = [],
      channel = '',
      cursor = 0,
      limit = PAGE_SIZE,
      onlyPath = null,
    } = body

    if (!paths?.length) {
      sendError(res, 400, 'path or paths required')
      return
    }

    if (regex?.trim()) validateRegex(regex.trim(), regexFlags ?? 'i')

    if (paths.length > 1 || (cursor && typeof cursor === 'object') || onlyPath) {
      const scopedPaths =
        onlyPath && typeof onlyPath === 'string' && paths.includes(onlyPath) ? paths : paths
      await handleMultiSearch(res, scopedPaths, {
        timeStart,
        timeEnd,
        phrase,
        excludePhrase,
        regex,
        regexFlags,
        caseSensitive,
        levels,
        channel,
        cursor: typeof cursor === 'object' ? cursor : null,
        limit,
        onlyPath: typeof onlyPath === 'string' && paths.includes(onlyPath) ? onlyPath : null,
      }, guard)
      return
    }

    const path = paths[0]

    const { start, end } = await byteRangeForTimeFilter(path, timeStart, timeEnd)
    const scanStart = Math.max(start, cursor)
    if (scanStart >= end) {
      if (guard.isClosed()) return
      if (
        !guard.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
      ) {
        return
      }
      guard.write(
        `${JSON.stringify({ type: 'meta', scanStart, scanEnd: end, mode: 'metadata', pageSize: limit })}\n`,
      )
      guard.write(`${JSON.stringify({ type: 'done', nextCursor: null, hasMore: false, count: 0 })}\n`)
      guard.end()
      return
    }

    const { mode, args } = buildRgArgs({ phrase, regex, regexFlags, caseSensitive, levels, channel })
    const st = await stat(path)
    fd = await open(path, 'r')

    if (guard.isClosed()) return
    if (
      !guard.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
    ) {
      return
    }

    const write = (obj) => {
      if (guard.isClosed()) return false
      return guard.write(`${JSON.stringify(obj)}\n`)
    }

    write({
      type: 'meta',
      scanStart,
      scanEnd: end,
      mode,
      pageSize: limit,
    })

    const filters = {
      timeStart,
      timeEnd,
      excludePhrase,
      caseSensitive,
      levels,
      channel,
    }

    /** @type {number[]} */
    const matchOffsets = []
    const maxRgMatches = limit * 20

    await runRgOnRange({
      path,
      rangeStart: scanStart,
      rangeEnd: end,
      args,
      onMatch: ({ fileOffset }) => {
        matchOffsets.push(fileOffset)
      },
      limit: maxRgMatches,
      signal: guard.signal,
    })

    const seen = new Set()
    let emitted = 0
    let nextCursor = null

    for (const fileOffset of matchOffsets) {
      if (guard.isClosed()) return
      const entry = await resolveEntry(fd, fileOffset, st.size)
      if (!entry) continue
      if (seen.has(entry.offset)) continue
      seen.add(entry.offset)
      if (!entryMatchesFilters(entry, filters)) continue

      write({
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
      })
      emitted++
      if (emitted >= limit) {
        nextCursor = entry.offset + entry.length
        break
      }
    }

    if (guard.isClosed()) return

    if (emitted >= limit && nextCursor !== null && nextCursor < end) {
      write({ type: 'done', nextCursor, hasMore: true, hasMoreByPath: { [path]: true }, count: emitted })
    } else {
      write({ type: 'done', nextCursor: null, hasMore: false, hasMoreByPath: { [path]: false }, count: emitted })
    }

    guard.end()
  } catch (err) {
    if (guard.signal.aborted) return
    const msg = err instanceof Error ? err.message : String(err)
    sendStreamError(res, msg, guard)
  } finally {
    if (fd) await fd.close()
  }
}

/** @param {import('node:http').ServerResponse} res @param {string[]} paths @param {object} opts @param {ReturnType<typeof bindClientGuard>} guard */
async function handleMultiSearch(res, paths, opts, guard) {
  try {
    const { mode, entries, hasMore, hasMoreByPath, nextCursor } = await searchMultiFiles(
      paths,
      {
        timeStart: opts.timeStart,
        timeEnd: opts.timeEnd,
        phrase: opts.phrase,
        excludePhrase: opts.excludePhrase,
        regex: opts.regex,
        regexFlags: opts.regexFlags,
        caseSensitive: opts.caseSensitive,
        levels: opts.levels,
        channel: opts.channel,
      },
      opts.limit,
      opts.cursor,
      opts.onlyPath,
      guard.signal,
    )

    if (guard.isClosed()) return

    if (
      !guard.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
    ) {
      return
    }

    const write = (obj) => {
      if (guard.isClosed()) return false
      return guard.write(`${JSON.stringify(obj)}\n`)
    }
    write({ type: 'meta', mode, pageSize: opts.limit, fileCount: paths.length })
    for (const entry of entries) {
      if (guard.isClosed()) return
      write(entry)
    }
    write({ type: 'done', nextCursor, hasMore, hasMoreByPath, count: entries.length })
    guard.end()
  } catch (err) {
    if (guard.signal.aborted) return
    const msg = err instanceof Error ? err.message : String(err)
    sendStreamError(res, msg, guard)
  }
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {ReturnType<typeof bindClientGuard>} guard */
async function handleCount(req, res, guard) {
  const body = await readJsonBody(req)
  const paths = normalizePaths(body)
  const { timeStart = null, timeEnd = null, phrase = '', regex = '', regexFlags = 'i', caseSensitive = false, levels = [], channel = '' } = body
  if (!paths?.length) {
    sendError(res, 400, 'path or paths required')
    return
  }

  const { args } = buildRgArgs({ phrase, regex, regexFlags, caseSensitive, levels, channel })

  try {
    const count =
      paths.length === 1
        ? await (async () => {
            const { start, end } = await byteRangeForTimeFilter(paths[0], timeStart, timeEnd)
            return runRgCount({ path: paths[0], rangeStart: start, rangeEnd: end, args, signal: guard.signal })
          })()
        : await countMultiFiles(
            paths,
            {
              timeStart,
              timeEnd,
              phrase,
              regex,
              regexFlags,
              caseSensitive,
              levels,
              channel,
            },
            guard.signal,
          )
    if (guard.isClosed()) return
    sendJson(res, { count }, guard)
  } catch (err) {
    if (guard.signal.aborted) return
    sendJson(res, { count: null }, guard)
  }
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} pathname */
function serveStatic(req, res, pathname) {
  let filePath = join(WEB_DIST, pathname === '/' ? 'index.html' : pathname)
  if (!existsSync(filePath) && !extname(pathname)) {
    filePath = join(WEB_DIST, 'index.html')
  }
  if (!existsSync(filePath)) {
    res.writeHead(404)
    res.end('Not found. Run npm run build first.')
    return
  }

  const ext = extname(filePath)
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
  }
  res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
}
