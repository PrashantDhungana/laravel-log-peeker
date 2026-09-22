import type { SearchEntry } from '../api'

export function entryIdentity(entry: SearchEntry): string {
  return `${entry.path ?? ''}:${entry.offset}`
}

/** Append new entries after the last row for the given file, skipping duplicates. */
export function mergeFileResults(
  previous: SearchEntry[],
  path: string,
  incoming: SearchEntry[],
): SearchEntry[] {
  const seen = new Set(previous.map(entryIdentity))
  const unique = incoming.filter((entry) => !seen.has(entryIdentity(entry)))
  if (!unique.length) return previous

  let insertAfter = -1
  for (let i = previous.length - 1; i >= 0; i--) {
    if ((previous[i].path ?? '') === path) {
      insertAfter = i
      break
    }
  }

  if (insertAfter === -1) return [...previous, ...unique]
  return [...previous.slice(0, insertAfter + 1), ...unique, ...previous.slice(insertAfter + 1)]
}
