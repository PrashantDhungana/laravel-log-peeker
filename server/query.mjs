const LEVELS = ['DEBUG', 'INFO', 'NOTICE', 'WARNING', 'ERROR', 'CRITICAL', 'ALERT', 'EMERGENCY']

/**
 * @param {object} filters
 * @param {string} [filters.phrase]
 * @param {string} [filters.regex]
 * @param {string} [filters.regexFlags]
 * @param {boolean} [filters.caseSensitive]
 * @param {string[]} [filters.levels]
 * @param {string} [filters.channel]
 */
export function buildRgArgs(filters) {
  const args = []

  if (filters.phrase?.trim()) {
    if (!filters.caseSensitive) args.push('-i')
    args.push('-F', '-e', filters.phrase.trim())
    return { mode: 'content', args }
  }

  if (filters.regex?.trim()) {
    const flags = filters.regexFlags ?? 'i'
    if (flags.includes('i')) args.push('-i')
    args.push('-e', filters.regex.trim())
    return { mode: 'content', args }
  }

  let pattern = '^\\[[^\\]]+\\]'

  if (filters.channel?.trim()) {
    const ch = escapeRegex(filters.channel.trim())
    pattern += ` ${ch}\\.`
  } else {
    pattern += ' [^\\s.]+\\.'
  }

  if (filters.levels?.length) {
    const lvls = filters.levels.map(escapeRegex).join('|')
    pattern += `(${lvls}):`
  } else {
    pattern += '[A-Z]+:'
  }

  args.push('-i', '-e', pattern)
  return { mode: 'metadata', args }
}

/** @param {string} s */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {object} entry
 * @param {object} filters
 */
export function entryMatchesFilters(entry, filters) {
  if (filters.timeStart !== null && filters.timeStart !== undefined && entry.time !== null) {
    if (entry.time < filters.timeStart) return false
  }
  if (filters.timeEnd !== null && filters.timeEnd !== undefined && entry.time !== null) {
    if (entry.time > filters.timeEnd) return false
  }

  if (filters.levels?.length && !filters.levels.includes(entry.level)) return false
  if (filters.channel?.trim() && entry.channel !== filters.channel.trim()) return false

  if (filters.excludePhrase?.trim()) {
    const needle = filters.excludePhrase.trim()
    const hay = filters.caseSensitive ? entry.body : entry.body.toLowerCase()
    const n = filters.caseSensitive ? needle : needle.toLowerCase()
    if (hay.includes(n)) return false
  }

  return true
}

export { LEVELS }
