import { createHash } from 'crypto'
import { readFileSync } from 'fs'

export function sha256File(filePath: string): string {
  const buffer = readFileSync(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

export function sha256String(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
