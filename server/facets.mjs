import { stat } from 'node:fs/promises'
import { parseHeaderLine } from './entries.mjs'
import { buildRgArgs } from './query.mjs'
import { runRgOnRange } from './rg.mjs'

const LEVEL_ORDER = [
  'DEBUG',
  'INFO',
  'NOTICE',
  'WARNING',
  'ERROR',
  'CRITICAL',
  'ALERT',
  'EMERGENCY',
]

/** @param {Map<string, number>} counts */
function sortLevels(counts) {
  return [...counts.entries()]
    .sort((a, b) => {
      const ai = LEVEL_ORDER.indexOf(a[0])
      const bi = LEVEL_ORDER.indexOf(b[0])
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0])
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
    .map(([name, count]) => ({ name, count }))
}

/** @param {Map<string, number>} counts */
function sortChannels(counts) {
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }))
}

/** @param {string} path */
export async function collectFacets(path) {
  const { size } = await stat(path)
  const { args } = buildRgArgs({})

  const levelCounts = new Map()
  const channelCounts = new Map()

  await runRgOnRange({
    path,
    rangeStart: 0,
    rangeEnd: size,
    args,
    onMatch: ({ lineText }) => {
      const header = parseHeaderLine(lineText.replace(/\r?\n$/, ''))
      if (!header) return
      levelCounts.set(header.level, (levelCounts.get(header.level) ?? 0) + 1)
      channelCounts.set(header.channel, (channelCounts.get(header.channel) ?? 0) + 1)
    },
  })

  return {
    levels: sortLevels(levelCounts),
    channels: sortChannels(channelCounts),
    entryCount: [...levelCounts.values()].reduce((sum, n) => sum + n, 0),
  }
}
