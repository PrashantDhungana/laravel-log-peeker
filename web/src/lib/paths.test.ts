import { describe, expect, it } from 'vitest'
import { fileUriToPath, pathsFromDataTransfer } from './paths'

describe('fileUriToPath', () => {
  it('converts Windows file URIs', () => {
    expect(fileUriToPath('file:///C:/logs/laravel.log')).toBe('C:/logs/laravel.log')
    expect(fileUriToPath('file:///C:/logs/laravel%20.log')).toBe('C:/logs/laravel .log')
  })

  it('ignores non-file URIs', () => {
    expect(fileUriToPath('https://example.com/a.log')).toBeNull()
    expect(fileUriToPath('')).toBeNull()
  })
})

describe('pathsFromDataTransfer', () => {
  it('reads file URIs and plain paths', () => {
    const dt = {
      getData(type: string) {
        if (type === 'text/uri-list') return 'file:///D:/app/storage/logs/laravel.log'
        if (type === 'text/plain') return ''
        return ''
      },
      files: [],
    } as DataTransfer

    expect(pathsFromDataTransfer(dt)).toEqual(['D:/app/storage/logs/laravel.log'])
  })

  it('reads Electron-style file.path', () => {
    const dt = {
      getData: () => '',
      files: [{ path: 'C:\\logs\\laravel.log', name: 'laravel.log' }],
    } as unknown as DataTransfer

    expect(pathsFromDataTransfer(dt)).toEqual(['C:\\logs\\laravel.log'])
  })
})
