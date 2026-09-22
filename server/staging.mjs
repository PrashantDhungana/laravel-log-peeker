import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'

export const STAGING_ROOT = join(tmpdir(), 'storage-peeker-staging')

/** @param {string} name */
export function safeFilename(name) {
  const base = basename(name || 'upload.log').replace(/[^\w.\-()+ ]/g, '_')
  return base || 'upload.log'
}

/**
 * Stream an uploaded file into a local staging directory for ripgrep access.
 * @param {string} filename
 * @param {import('node:stream').Readable} sourceStream
 */
export async function stageFileStream(filename, sourceStream) {
  const sessionId = randomBytes(8).toString('hex')
  const dir = join(STAGING_ROOT, sessionId)
  await mkdir(dir, { recursive: true })
  const dest = join(dir, safeFilename(filename))
  await pipeline(sourceStream, createWriteStream(dest))
  return dest
}
