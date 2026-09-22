import { execSync } from 'node:child_process'

/** @param {string} cmd */
export function whichSync(cmd) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`where ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
      return out.split('\n')[0]?.trim() || null
    }
    const out = execSync(`which ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
    return out.trim() || null
  } catch {
    return null
  }
}

const guardedSockets = new WeakSet()

/** @param {string} origin */
function isAllowedDevOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/**
 * Allow the Vite dev UI (different port) to call the API directly.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} true when the request was handled (OPTIONS preflight)
 */
export function applyDevCors(req, res) {
  const origin = req.headers.origin
  if (typeof origin === 'string' && isAllowedDevOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-peeker-token, X-Filename')
    res.setHeader('Vary', 'Origin')
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }

  return false
}

/** @param {import('node:net').Socket | null | undefined} socket */
export function attachSocketSafety(socket) {
  if (!socket || guardedSockets.has(socket)) return
  guardedSockets.add(socket)
  socket.on('error', () => {
    // Client closed the connection (common when aborting in-flight API calls).
  })
}

/**
 * Track client disconnects and swallow response socket write errors so aborted
 * proxy requests do not crash the Node process.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function bindClientGuard(req, res) {
  let closed = false
  const controller = new AbortController()

  const close = () => {
    if (closed) return
    closed = true
    controller.abort()
  }

  attachSocketSafety(req.socket)
  attachSocketSafety(res.socket)
  if (!res.socket) {
    res.on('socket', (socket) => attachSocketSafety(socket))
  }

  // Do not use req "close" — it fires after the request body is fully read, while
  // the client is still waiting for the response, which would abort every search.
  req.on('aborted', close)
  res.on('close', () => {
    if (!res.writableFinished) close()
  })
  res.on('error', close)

  return {
    signal: controller.signal,
    isClosed: () => closed || res.writableEnded || res.destroyed,
    writeHead: (...args) => {
      if (closed || res.headersSent || res.writableEnded || res.destroyed) return false
      try {
        res.writeHead(...args)
        return true
      } catch {
        close()
        return false
      }
    },
    write: (chunk) => {
      if (closed || res.writableEnded || res.destroyed) return false
      try {
        res.write(chunk)
        return true
      } catch {
        close()
        return false
      }
    },
    end: (chunk) => {
      if (closed || res.writableEnded) return
      try {
        if (chunk === undefined) res.end()
        else res.end(chunk)
      } catch {
        close()
      }
    },
  }
}

/** @param {import('node:http').IncomingMessage} req */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 1_000_000) reject(new Error('Body too large'))
    })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/** @param {import('node:http').ServerResponse} res @param {number} code @param {string} msg */
export function sendError(res, code, msg) {
  if (res.writableEnded || res.destroyed) return
  try {
    if (res.headersSent) {
      res.end()
      return
    }
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: msg }))
  } catch {
    /* client gone */
  }
}

/** @param {import('node:http').ServerResponse} res @param {string} msg @param {{ isClosed?: () => boolean } | null} [guard] */
export function sendStreamError(res, msg, guard = null) {
  if (guard?.isClosed?.()) return
  if (!res.headersSent) {
    sendError(res, 500, msg)
    return
  }
  if (!res.writableEnded && !res.destroyed) {
    try {
      res.write(`${JSON.stringify({ type: 'error', message: msg })}\n`)
      res.end()
    } catch {
      /* client gone */
    }
  }
}

/** @param {import('node:http').ServerResponse} res @param {unknown} data @param {ReturnType<typeof bindClientGuard> | null} [guard] */
export function sendJson(res, data, guard = null) {
  if (guard?.isClosed?.()) return
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(data)
  if (guard) {
    if (!guard.writeHead(200, { 'Content-Type': 'application/json' })) return
    guard.end(body)
    return
  }
  try {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(body)
  } catch {
    /* client gone */
  }
}
