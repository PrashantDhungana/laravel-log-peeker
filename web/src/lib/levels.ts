export const LEVELS = [
  'DEBUG',
  'INFO',
  'NOTICE',
  'WARNING',
  'ERROR',
  'CRITICAL',
  'ALERT',
  'EMERGENCY',
] as const

export type LogLevel = (typeof LEVELS)[number]

export function levelColour(level: string): string {
  switch (level) {
    case 'ERROR':
    case 'CRITICAL':
    case 'ALERT':
    case 'EMERGENCY':
      return 'bg-red-900/80 text-red-200'
    case 'WARNING':
      return 'bg-amber-900/80 text-amber-200'
    case 'NOTICE':
    case 'INFO':
      return 'bg-sky-900/80 text-sky-200'
    default:
      return 'bg-zinc-700 text-zinc-200'
  }
}
