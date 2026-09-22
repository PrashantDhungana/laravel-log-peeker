import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { whichSync } from './util.mjs'

const projectRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const require = createRequire(join(projectRoot, 'package.json'))

/** @returns {string} */
export function getRgPath() {
  /** @type {string[]} */
  const candidates = []

  try {
    const { rgPath } = require('@vscode/ripgrep')
    if (rgPath) candidates.push(rgPath)
  } catch {
    try {
      const arch = process.env.npm_config_arch || process.arch
      const bin = process.platform === 'win32' ? 'rg.exe' : 'rg'
      const platformPkg = `@vscode/ripgrep-${process.platform}-${arch}`
      candidates.push(require.resolve(`${platformPkg}/bin/${bin}`))
    } catch {
      /* fall through */
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  const system = whichSync('rg')
  if (system && existsSync(system)) return system

  throw new Error(
    'ripgrep not found. Run `npm install` in the project folder (installs @vscode/ripgrep), or add rg to PATH.',
  )
}

/**
 * @param {object} opts
 * @param {string} opts.path
 * @param {number} opts.rangeStart
 * @param {number} opts.rangeEnd
 * @param {string[]} opts.args - rg args excluding path (uses stdin)
 * @param {AbortSignal} [opts.signal]
 * @param {(match: { fileOffset: number, lineNumber: number, lineText: string }) => void} opts.onMatch
 * @param {number} [opts.limit]
 */
export function runRgOnRange({ path, rangeStart, rangeEnd, args, signal, onMatch, limit = Infinity }) {
  return new Promise((resolve, reject) => {
    const rgPath = getRgPath()
    const rgArgs = ['--json', ...args, '-']
    const proc = spawn(rgPath, rgArgs, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })

    let matches = 0
    let buf = ''
    let stderr = ''
    let settled = false

    const finish = (err) => {
      if (settled) return
      settled = true
      try {
        proc.kill()
      } catch {
        /* already dead */
      }
      if (err) reject(err)
      else resolve(matches)
    }

    if (signal) {
      signal.addEventListener('abort', () => finish(new Error('Aborted')), { once: true })
    }

    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString()
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line.trim()) continue
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'match') {
            const rel = ev.data.absolute_offset ?? 0
            onMatch({
              fileOffset: rangeStart + rel,
              lineNumber: ev.data.line_number,
              lineText: ev.data.lines?.text ?? '',
            })
            matches++
            if (matches >= limit) {
              settled = true
              stream.destroy()
              try {
                proc.stdin.end()
              } catch {
                /* ignore */
              }
              try {
                proc.kill()
              } catch {
                /* ignore */
              }
              resolve(matches)
              return
            }
          }
        } catch {
          /* ignore malformed json line */
        }
      }
    })

    proc.on('error', (err) => finish(err))
    proc.on('close', (code) => {
      if (settled || signal?.aborted) return
      if (code === 0 || code === 1 || code === null) finish()
      else finish(new Error(stderr.trim() || `rg exited with code ${code}`))
    })

    const stream = createReadStream(path, {
      start: rangeStart,
      end: rangeEnd > rangeStart ? rangeEnd - 1 : rangeStart,
    })
    stream.on('error', (err) => {
      if (settled && err.code === 'EPIPE') return
      finish(err)
    })
    stream.pipe(proc.stdin)
  })
}

/**
 * @param {object} opts
 * @param {string} opts.path
 * @param {number} opts.rangeStart
 * @param {number} opts.rangeEnd
 * @param {string[]} opts.args
 */
export function runRgCount({ path, rangeStart, rangeEnd, args }) {
  return new Promise((resolve, reject) => {
    const rgPath = getRgPath()
    const proc = spawn(rgPath, ['--count-matches', ...args, '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        const n = parseInt(stdout.trim().split('\n')[0] ?? '0', 10)
        resolve(Number.isNaN(n) ? 0 : n)
      } else reject(new Error(stderr.trim() || `rg count exited ${code}`))
    })

    const stream = createReadStream(path, {
      start: rangeStart,
      end: rangeEnd > rangeStart ? rangeEnd - 1 : rangeStart,
    })
    stream.on('error', reject)
    stream.pipe(proc.stdin)
  })
}
