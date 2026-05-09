import { ipcMain } from 'electron'
import type { Memory } from '@bestfriend/core'
import { getDb } from '../db/index.js'
import { MemoryRepo } from '../db/repos/MemoryRepo.js'

function validateId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`)
  }
  return value.trim()
}

function validateMemoryContent(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('content must be a non-empty string')
  }
  return value.trim()
}

export function registerMemoryHandlers(): void {
  ipcMain.handle('memories:list', async (): Promise<Memory[]> => {
    return new MemoryRepo(getDb()).listActive()
  })

  ipcMain.handle(
    'memories:update',
    async (_e, rawId: unknown, rawContent: unknown): Promise<void> => {
      const id = validateId(rawId, 'id')
      const content = validateMemoryContent(rawContent)
      new MemoryRepo(getDb()).updateContent(id, content)
    },
  )

  ipcMain.handle(
    'memories:pin',
    async (_e, rawId: unknown, rawPinned: unknown): Promise<void> => {
      const id = validateId(rawId, 'id')
      if (typeof rawPinned !== 'boolean') throw new Error('pinned must be a boolean')
      new MemoryRepo(getDb()).setPinned(id, rawPinned)
    },
  )

  ipcMain.handle('memories:delete', async (_e, rawId: unknown): Promise<void> => {
    const id = validateId(rawId, 'id')
    new MemoryRepo(getDb()).softDelete(id)
  })
}
