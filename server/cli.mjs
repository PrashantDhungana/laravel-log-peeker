#!/usr/bin/env node
import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from './server.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const WEB_DIST = join(__dirname, '..', 'web-dist')

/** @param {string} url */
function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`
  exec(cmd)
}

async function main() {
  const args = process.argv.slice(2)
  let port = 3847
  let noOpen = false
  let initialPath = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[++i], 10)
    } else if (args[i] === '--no-open') {
      noOpen = true
    } else if (!args[i].startsWith('-')) {
      initialPath = resolve(args[i])
    }
  }

  if (!existsSync(WEB_DIST)) {
    console.warn('web-dist/ not found — run `npm run build` for production UI, or `npm run dev` for development.')
  }

  const { baseUrl, token } = await startServer({ port, openBrowser: !noOpen })
  const url = initialPath
    ? `${baseUrl}&path=${encodeURIComponent(initialPath)}`
    : baseUrl

  console.log(`Storage Peeker listening on ${baseUrl}`)
  console.log(`Token: ${token}`)

  if (!noOpen) openBrowser(url)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
