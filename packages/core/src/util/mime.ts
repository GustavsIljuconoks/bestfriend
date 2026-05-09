import { extname } from 'path'

const MIME_MAP: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

export function mimeFromPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_MAP[ext] ?? 'application/octet-stream'
}

export function isTextMime(mime: string): boolean {
  return mime === 'text/plain' || mime === 'text/markdown'
}

export function isAudioMime(mime: string): boolean {
  return mime.startsWith('audio/')
}

export function isPdfMime(mime: string): boolean {
  return mime === 'application/pdf'
}

export function isDocxMime(mime: string): boolean {
  return mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export function isSupportedMime(mime: string): boolean {
  return isTextMime(mime) || isPdfMime(mime) || isDocxMime(mime) || isAudioMime(mime)
}

export const SUPPORTED_EXTENSIONS = Object.keys(MIME_MAP)
