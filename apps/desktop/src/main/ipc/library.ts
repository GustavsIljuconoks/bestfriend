import { ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import type { DocumentSummary, Collection, IndexingEstimate } from '@bestfriend/core'
import { getDb } from '../db/index.js'
import { DocumentRepo } from '../db/repos/DocumentRepo.js'
import { ChunkRepo } from '../db/repos/ChunkRepo.js'
import { CollectionRepo } from '../db/repos/CollectionRepo.js'
import { FolderIndexRepo } from '../db/repos/FolderIndexRepo.js'
import { getJobQueue } from '../jobs/JobQueue.js'
import { ingestFiles, estimateFilePaths, removeDocumentVectors } from '../jobs/ingest.js'
import { getSupportedFilesInFolder } from '../jobs/scanFolder.js'

function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function validateStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new Error(`${name} must be an array of strings`)
  }
  return value as string[]
}

export function registerLibraryHandlers(): void {
  ipcMain.handle('library:pickFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choose a folder to index',
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(
    'library:addFolderIndex',
    async (_event, rawPath: unknown): Promise<{ indexId: string }> => {
      const path = validateString(rawPath, 'path')
      const repo = new FolderIndexRepo(getDb())
      const folderIndex = repo.create(path)
      return { indexId: folderIndex.id }
    },
  )

  ipcMain.handle(
    'library:scanFolder',
    async (_event, rawIndexId: unknown): Promise<{ jobId: string }> => {
      const indexId = validateString(rawIndexId, 'indexId')
      const db = getDb()
      const repo = new FolderIndexRepo(db)
      const folderIndex = repo.getById(indexId)
      if (!folderIndex) throw new Error(`Folder index ${indexId} not found`)

      const filePaths = getSupportedFilesInFolder(folderIndex.path)
      const jobId = randomUUID()

      getJobQueue().enqueue(jobId, (onProgress) =>
        ingestFiles(db, filePaths, onProgress).then(() => {
          repo.markScanned(indexId)
        }),
      )

      return { jobId }
    },
  )

  ipcMain.handle(
    'library:dropFiles',
    async (_event, rawPaths: unknown): Promise<{ jobId: string }> => {
      const paths = validateStringArray(rawPaths, 'paths')
      const db = getDb()
      const jobId = randomUUID()

      getJobQueue().enqueue(jobId, (onProgress) => ingestFiles(db, paths, onProgress))

      return { jobId }
    },
  )

  ipcMain.handle(
    'library:estimateFiles',
    async (_event, rawPaths: unknown): Promise<IndexingEstimate> => {
      const paths = validateStringArray(rawPaths, 'paths')
      return estimateFilePaths(getDb(), paths)
    },
  )

  ipcMain.handle('library:listDocuments', async (): Promise<DocumentSummary[]> => {
    return new DocumentRepo(getDb()).listSummaries()
  })

  ipcMain.handle(
    'library:removeDocument',
    async (_event, rawId: unknown): Promise<void> => {
      const documentId = validateString(rawId, 'documentId')
      const db = getDb()
      await removeDocumentVectors(db, documentId)
      new ChunkRepo(db).deleteByDocument(documentId)
      new DocumentRepo(db).delete(documentId)
    },
  )

  ipcMain.handle(
    'library:reindexDocument',
    async (_event, rawId: unknown): Promise<{ jobId: string }> => {
      const documentId = validateString(rawId, 'documentId')
      const db = getDb()
      const doc = new DocumentRepo(db).getById(documentId)
      if (!doc) throw new Error(`Document ${documentId} not found`)

      const jobId = randomUUID()
      getJobQueue().enqueue(jobId, (onProgress) =>
        ingestFiles(db, [doc.source_uri], onProgress),
      )
      return { jobId }
    },
  )

  // Collections
  ipcMain.handle('library:listCollections', async (): Promise<Collection[]> => {
    return new CollectionRepo(getDb()).listAll()
  })

  ipcMain.handle(
    'library:createCollection',
    async (_event, rawName: unknown, rawColor: unknown): Promise<Collection> => {
      const name = validateString(rawName, 'name')
      const color = rawColor != null ? validateString(rawColor, 'color') : undefined
      return new CollectionRepo(getDb()).create(name, color)
    },
  )

  ipcMain.handle(
    'library:renameCollection',
    async (_event, rawId: unknown, rawName: unknown): Promise<void> => {
      const id = validateString(rawId, 'id')
      const name = validateString(rawName, 'name')
      new CollectionRepo(getDb()).rename(id, name)
    },
  )

  ipcMain.handle('library:deleteCollection', async (_event, rawId: unknown): Promise<void> => {
    const id = validateString(rawId, 'id')
    new CollectionRepo(getDb()).delete(id)
  })

  ipcMain.handle(
    'library:assignDocumentToCollection',
    async (_event, rawDocId: unknown, rawColId: unknown): Promise<void> => {
      const documentId = validateString(rawDocId, 'documentId')
      const collectionId = validateString(rawColId, 'collectionId')
      new CollectionRepo(getDb()).assignDocument(documentId, collectionId)
    },
  )

  ipcMain.handle(
    'library:removeDocumentFromCollection',
    async (_event, rawDocId: unknown, rawColId: unknown): Promise<void> => {
      const documentId = validateString(rawDocId, 'documentId')
      const collectionId = validateString(rawColId, 'collectionId')
      new CollectionRepo(getDb()).removeDocument(documentId, collectionId)
    },
  )
}
