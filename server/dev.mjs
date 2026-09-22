#!/usr/bin/env node
import { exec, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { startServer } from './server.mjs'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')

const { baseUrl, token, port } = await startServer({ port: 3847, openBrowser: false })
const apiOrigin = `http://127.0.0.1:${port}`
const devUrl = `http://127.0.0.1:5173?token=${token}`
console.log(`API server: ${baseUrl}`)
console.log(`Dev UI: ${devUrl}`)

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

openBrowser(devUrl)

const vite = spawn('npx', ['vite'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PEEKER_TOKEN: token,
    VITE_PEEKER_TOKEN: token,
    VITE_API_ORIGIN: apiOrigin,
  },
})

vite.on('close', (code) => process.exit(code ?? 0))

process.on('SIGINT', () => {
  vite.kill()
  process.exit(0)
})
