import type { FileInfo } from '../api'

export interface TimeRange {
  firstTime: number | null
  lastTime: number | null
}

/** Combined first/last entry time across the selected opened files. */
export function timeRangeForFiles(files: FileInfo[], selectedPaths: string[]): TimeRange {
  const selected = new Set(selectedPaths)
  const subset = files.filter((file) => selected.has(file.path))
  const firstTimes = subset.map((file) => file.firstTime).filter((t): t is number => t !== null)
  const lastTimes = subset.map((file) => file.lastTime).filter((t): t is number => t !== null)
  return {
    firstTime: firstTimes.length ? Math.min(...firstTimes) : null,
    lastTime: lastTimes.length ? Math.max(...lastTimes) : null,
  }
}
