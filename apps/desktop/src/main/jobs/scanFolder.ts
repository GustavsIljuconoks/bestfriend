import { readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { SUPPORTED_EXTENSIONS } from '@bestfriend/core'

function enumerateFiles(dir: string, result: string[] = []): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        enumerateFiles(fullPath, result)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          result.push(fullPath)
        }
      }
    }
  } catch {
    // skip unreadable directories
  }
  return result
}

export function getSupportedFilesInFolder(folderPath: string): string[] {
  try {
    statSync(folderPath)
    return enumerateFiles(folderPath)
  } catch {
    return []
  }
}
