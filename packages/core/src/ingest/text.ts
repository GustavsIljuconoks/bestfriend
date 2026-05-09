import { readFileSync } from 'fs'
import { basename } from 'path'
import { mimeFromPath } from '../util/mime.js'

export interface DocumentText {
  documentId: string
  displayName: string
  sourceUri: string
  mimeType: string
  fullText: string
}

export function parseTextFile(filePath: string, documentId: string): DocumentText {
  const content = readFileSync(filePath, 'utf8')
  const mime = mimeFromPath(filePath)
  return {
    documentId,
    displayName: basename(filePath),
    sourceUri: filePath,
    mimeType: mime,
    fullText: content,
  }
}
