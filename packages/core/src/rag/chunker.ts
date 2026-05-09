import { estimateTokens } from '../util/tokens.js'

export interface ChunkInput {
  documentId: string
  fullText: string
  targetChunkTokens?: number
  overlapTokens?: number
}

export interface TextChunk {
  documentId: string
  chunkIndex: number
  chunkText: string
  tokenCountEstimate: number
}

export function chunkDocument(input: ChunkInput): TextChunk[] {
  const { documentId, fullText, targetChunkTokens = 400, overlapTokens = 80 } = input

  const normalized = fullText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const paragraphs = normalized.split(/\n\n+/).filter((p) => p.trim().length > 0)

  const chunks: TextChunk[] = []
  let currentParagraphs: string[] = []
  let currentTokens = 0

  const flush = () => {
    if (currentParagraphs.length === 0) return
    const text = currentParagraphs.join('\n\n')
    chunks.push({
      documentId,
      chunkIndex: chunks.length,
      chunkText: text,
      tokenCountEstimate: estimateTokens(text),
    })
    currentParagraphs = buildOverlap(currentParagraphs, overlapTokens)
    currentTokens = estimateTokens(currentParagraphs.join('\n\n'))
  }

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)

    if (paraTokens > targetChunkTokens) {
      if (currentParagraphs.length > 0) flush()
      const subChunks = splitLargeParagraph(para, documentId, chunks.length, targetChunkTokens)
      chunks.push(...subChunks)
      continue
    }

    if (currentTokens + paraTokens > targetChunkTokens && currentParagraphs.length > 0) {
      flush()
    }

    currentParagraphs.push(para)
    currentTokens += paraTokens
  }

  flush()

  return chunks
}

function buildOverlap(paragraphs: string[], overlapTokens: number): string[] {
  let accumulated = 0
  const overlap: string[] = []
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const t = estimateTokens(paragraphs[i])
    if (accumulated + t > overlapTokens) break
    overlap.unshift(paragraphs[i])
    accumulated += t
  }
  return overlap
}

function splitLargeParagraph(
  para: string,
  documentId: string,
  startIndex: number,
  targetTokens: number,
): TextChunk[] {
  const sentences = para.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  const chunks: TextChunk[] = []
  let currentSentences: string[] = []
  let currentTokens = 0

  const flush = () => {
    if (currentSentences.length === 0) return
    const text = currentSentences.join(' ')
    chunks.push({
      documentId,
      chunkIndex: startIndex + chunks.length,
      chunkText: text,
      tokenCountEstimate: estimateTokens(text),
    })
    currentSentences = []
    currentTokens = 0
  }

  for (const sentence of sentences) {
    const t = estimateTokens(sentence)
    if (currentTokens + t > targetTokens && currentSentences.length > 0) {
      flush()
    }
    currentSentences.push(sentence)
    currentTokens += t
  }

  flush()
  return chunks
}
