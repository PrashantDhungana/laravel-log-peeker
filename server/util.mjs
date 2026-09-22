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
  if (res.headersSent) {
    if (!res.writableEnded) res.end()
    return
  }
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: msg }))
}

/** @param {import('node:http').ServerResponse} res @param {string} msg */
export function sendStreamError(res, msg) {
  if (!res.headersSent) {
    sendError(res, 500, msg)
    return
  }
  if (!res.writableEnded) {
    res.write(`${JSON.stringify({ type: 'error', message: msg })}\n`)
    res.end()
  }
}

/** @param {import('node:http').ServerResponse} res @param {unknown} data */
export function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}
