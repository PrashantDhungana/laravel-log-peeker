import { createServer } from 'node:http'
import { open, stat } from 'node:fs/promises'
import { createReadStream, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { openFileInfo, byteRangeForTimeFilter } from './logfile.mjs'
import { resolveEntry, readEntryAt, readNeighbors } from './entries.mjs'
import { buildRgArgs, entryMatchesFilters } from './query.mjs'
import { runRgOnRange, runRgCount } from './rg.mjs'
import { collectFacets } from './facets.mjs'
import { normalizePaths, openFilesInfo, mergeFacets, searchMultiFiles, countMultiFiles } from './multi.mjs'
import { readJsonBody, sendError, sendJson, sendStreamError } from './util.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const WEB_DIST = join(__dirname, '..', 'web-dist')
const PAGE_SIZE = 100

/**
 * @param {object} opts
 * @param {number} [opts.port]
 * @param {string} [opts.token]
 * @param {boolean} [opts.openBrowser]
 */
export async function startServer({ port = 3847, token = randomBytes(16).toString('hex'), openBrowser = false } = {}) {
  const server = createServer(async (req, res) => {
    try {
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
        await handleApi(req, res, url)
        return
      }

      serveStatic(req, res, url.pathname)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (res.headersSent) sendStreamError(res, msg)
      else sendError(res, 500, msg)
    }
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${port}?token=${token}`
  return { server, port, token, baseUrl, openBrowser }
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {URL} url */
async function handleApi(req, res, url) {
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
    await handleSearch(req, res)
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
    await handleCount(req, res)
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
      const facets = paths.length === 1 ? await collectFacets(paths[0]) : await mergeFacets(paths)
      sendJson(res, facets)
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

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
async function handleSearch(req, res) {
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
    } = body

    if (!paths?.length) {
      sendError(res, 400, 'path or paths required')
      return
    }

    if (regex?.trim()) validateRegex(regex.trim(), regexFlags ?? 'i')

    if (paths.length > 1 || (cursor && typeof cursor === 'object')) {
      await handleMultiSearch(res, paths, {
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
      })
      return
    }

    const path = paths[0]

    const { start, end } = await byteRangeForTimeFilter(path, timeStart, timeEnd)
    const scanStart = Math.max(start, cursor)
    if (scanStart >= end) {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(
        `${JSON.stringify({ type: 'meta', scanStart, scanEnd: end, mode: 'metadata', pageSize: limit })}\n`,
      )
      res.write(`${JSON.stringify({ type: 'done', nextCursor: null, hasMore: false, count: 0 })}\n`)
      res.end()
      return
    }

    const { mode, args } = buildRgArgs({ phrase, regex, regexFlags, caseSensitive, levels, channel })
    const st = await stat(path)
    fd = await open(path, 'r')

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const write = (obj) => res.write(`${JSON.stringify(obj)}\n`)

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
    })

    const seen = new Set()
    let emitted = 0
    let nextCursor = null

    for (const fileOffset of matchOffsets) {
      const entry = await resolveEntry(fd, fileOffset, st.size)
      if (!entry) continue
      if (seen.has(entry.offset)) continue
      seen.add(entry.offset)
      if (!entryMatchesFilters(entry, filters)) continue

      write({
        type: 'entry',
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

    if (emitted >= limit && nextCursor !== null && nextCursor < end) {
      write({ type: 'done', nextCursor, hasMore: true, count: emitted })
    } else {
      write({ type: 'done', nextCursor: null, hasMore: false, count: emitted })
    }

    res.end()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendStreamError(res, msg)
  } finally {
    if (fd) await fd.close()
  }
}

/** @param {import('node:http').ServerResponse} res @param {string[]} paths @param {object} opts */
async function handleMultiSearch(res, paths, opts) {
  try {
    const { mode, entries, hasMore, nextCursor } = await searchMultiFiles(
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
    )

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const write = (obj) => res.write(`${JSON.stringify(obj)}\n`)
    write({ type: 'meta', mode, pageSize: opts.limit, fileCount: paths.length })
    for (const entry of entries) write(entry)
    write({ type: 'done', nextCursor, hasMore, count: entries.length })
    res.end()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendStreamError(res, msg)
  }
}

/** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
async function handleCount(req, res) {
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
            return runRgCount({ path: paths[0], rangeStart: start, rangeEnd: end, args })
          })()
        : await countMultiFiles(paths, {
            timeStart,
            timeEnd,
            phrase,
            regex,
            regexFlags,
            caseSensitive,
            levels,
            channel,
          })
    sendJson(res, { count })
  } catch {
    sendJson(res, { count: null })
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
