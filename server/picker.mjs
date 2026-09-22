import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PICKER_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Multiselect = $true
$d.Title = 'Select log files'
$d.Filter = 'Log files (*.log)|*.log|All files (*.*)|*.*'
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  $d.FileNames | ConvertTo-Json -Compress
}
`.trim()

/** @returns {Promise<string[]>} */
export async function pickLogFilesWindows() {
  if (process.platform !== 'win32') {
    throw new Error('Native file picker is only available on Windows')
  }

  const dir = await mkdtemp(join(tmpdir(), 'peeker-picker-'))
  const scriptPath = join(dir, 'pick.ps1')

  try {
    await writeFile(scriptPath, PICKER_SCRIPT, 'utf8')
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: false, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
    )

    const raw = stdout.trim()
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((p) => typeof p === 'string')
    if (typeof parsed === 'string') return [parsed]
    return []
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 1) return []
    throw err
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
