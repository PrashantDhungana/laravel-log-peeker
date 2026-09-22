/** Convert a file:// URI from drag-and-drop into a local filesystem path. */
export function fileUriToPath(uri: string): string | null {
  const trimmed = uri.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'file:') return null
    let path = decodeURIComponent(url.pathname)
    // Windows: /C:/Users/... → C:/Users/...
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
    // UNC: file://server/share → //server/share
    if (url.hostname) {
      path = `//${url.hostname}${path}`
    }
    return path
  } catch {
    return null
  }
}

function looksLikeAbsolutePath(value: string): boolean {
  return /^([A-Za-z]:[\\/]|\\\\|\/)/.test(value)
}

/** Collect File objects from a drag-and-drop data transfer. */
export function filesFromDataTransfer(dt: DataTransfer): File[] {
  return [...dt.files]
}

/** Extract absolute file paths from a drag-and-drop data transfer. */
export function pathsFromDataTransfer(dt: DataTransfer): string[] {
  const paths = new Set<string>()

  for (const line of dt.getData('text/uri-list').split(/\r?\n/)) {
    const path = fileUriToPath(line)
    if (path) paths.add(path)
  }

  const plain = dt.getData('text/plain').trim()
  if (plain) {
    for (const line of plain.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && looksLikeAbsolutePath(trimmed)) paths.add(trimmed)
    }
  }

  for (const file of dt.files) {
    const withPath = file as File & { path?: string }
    if (withPath.path) paths.add(withPath.path)
  }

  return [...paths]
}
