import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  WindowApi,
  JobEvent,
  MaskedSettings,
  SettingsPatch,
  TestConnectionsResult,
  CreatePineconeIndexResult,
  DocumentSummary,
  Collection,
  IndexingEstimate,
  ConversationSummary,
  Message,
  AssistantTurn,
  ChatStreamEvent,
  Proposal,
  ReminderPayload,
  Memory,
} from '@bestfriend/core'

const notImplemented = (): Promise<never> =>
  Promise.reject(new Error('Not implemented in this phase'))

const api: WindowApi = {
  // Library / indexing
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('library:pickFolder') as Promise<string | null>,

  addFolderIndex: (path: string): Promise<{ indexId: string }> =>
    ipcRenderer.invoke('library:addFolderIndex', path) as Promise<{ indexId: string }>,

  scanFolder: (indexId: string): Promise<{ jobId: string }> =>
    ipcRenderer.invoke('library:scanFolder', indexId) as Promise<{ jobId: string }>,

  dropFiles: (paths: string[]): Promise<{ jobId: string }> =>
    ipcRenderer.invoke('library:dropFiles', paths) as Promise<{ jobId: string }>,

  estimateFiles: (paths: string[]): Promise<IndexingEstimate> =>
    ipcRenderer.invoke('library:estimateFiles', paths) as Promise<IndexingEstimate>,

  getPathsForDroppedFiles: (files: File[]): string[] => {
    if (!Array.isArray(files)) return []
    const out: string[] = []
    for (const f of files) {
      try {
        const p = webUtils.getPathForFile(f)
        if (p.length > 0) out.push(p)
      } catch {
        const legacy = (f as File & { path?: string }).path
        if (typeof legacy === 'string' && legacy.length > 0) out.push(legacy)
      }
    }
    return out
  },

  listDocuments: (): Promise<DocumentSummary[]> =>
    ipcRenderer.invoke('library:listDocuments') as Promise<DocumentSummary[]>,

  removeDocument: (documentId: string): Promise<void> =>
    ipcRenderer.invoke('library:removeDocument', documentId) as Promise<void>,

  reindexDocument: (documentId: string): Promise<{ jobId: string }> =>
    ipcRenderer.invoke('library:reindexDocument', documentId) as Promise<{ jobId: string }>,

  onJobEvent: (callback: (event: JobEvent) => void) => {
    const handler = (_: IpcRendererEvent, event: JobEvent) => callback(event)
    ipcRenderer.on('job:event', handler)
    return () => ipcRenderer.removeListener('job:event', handler)
  },

  // Collections
  listCollections: (): Promise<Collection[]> =>
    ipcRenderer.invoke('library:listCollections') as Promise<Collection[]>,

  createCollection: (name: string, color?: string): Promise<Collection> =>
    ipcRenderer.invoke('library:createCollection', name, color) as Promise<Collection>,

  renameCollection: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('library:renameCollection', id, name) as Promise<void>,

  deleteCollection: (id: string): Promise<void> =>
    ipcRenderer.invoke('library:deleteCollection', id) as Promise<void>,

  assignDocumentToCollection: (documentId: string, collectionId: string): Promise<void> =>
    ipcRenderer.invoke(
      'library:assignDocumentToCollection',
      documentId,
      collectionId,
    ) as Promise<void>,

  removeDocumentFromCollection: (documentId: string, collectionId: string): Promise<void> =>
    ipcRenderer.invoke(
      'library:removeDocumentFromCollection',
      documentId,
      collectionId,
    ) as Promise<void>,

  // Chat
  listConversations: (): Promise<ConversationSummary[]> =>
    ipcRenderer.invoke('chat:listConversations') as Promise<ConversationSummary[]>,

  createConversation: (scopeCollectionIds?: string[]): Promise<{ conversationId: string }> =>
    ipcRenderer.invoke(
      'chat:createConversation',
      scopeCollectionIds ?? null,
    ) as Promise<{ conversationId: string }>,

  listMessages: (conversationId: string): Promise<Message[]> =>
    ipcRenderer.invoke('chat:listMessages', conversationId) as Promise<Message[]>,

  sendMessage: (conversationId: string, text: string): Promise<AssistantTurn> =>
    ipcRenderer.invoke('chat:sendMessage', conversationId, text) as Promise<AssistantTurn>,

  onChatStream: (callback: (event: ChatStreamEvent) => void) => {
    const handler = (_: IpcRendererEvent, event: ChatStreamEvent) => callback(event)
    ipcRenderer.on('chat:stream', handler)
    return () => ipcRenderer.removeListener('chat:stream', handler)
  },

  listProposals: (conversationId: string): Promise<Proposal[]> =>
    ipcRenderer.invoke('proposals:list', conversationId) as Promise<Proposal[]>,
  acceptProposal: (proposalId: string, edited?: Partial<ReminderPayload>): Promise<void> =>
    ipcRenderer.invoke('proposals:accept', proposalId, edited ?? null) as Promise<void>,
  rejectProposal: (proposalId: string): Promise<void> =>
    ipcRenderer.invoke('proposals:reject', proposalId) as Promise<void>,

  // Reminders (Phase 5)
  listReminders: () => notImplemented(),
  snoozeReminder: () => notImplemented(),
  dismissReminder: () => notImplemented(),

  // Feed (Phase 5)
  listFeedItems: () => notImplemented(),
  markFeedRead: () => notImplemented(),

  // Inbox (Phase 8)
  quickCaptureText: () => notImplemented(),
  quickCaptureVoice: () => notImplemented(),
  listInbox: () => notImplemented(),
  triageInboxItem: () => notImplemented(),
  openCaptureWindow: () => notImplemented(),

  listMemories: (): Promise<Memory[]> =>
    ipcRenderer.invoke('memories:list') as Promise<Memory[]>,
  updateMemory: (id: string, content: string): Promise<void> =>
    ipcRenderer.invoke('memories:update', id, content) as Promise<void>,
  pinMemory: (id: string, pinned: boolean): Promise<void> =>
    ipcRenderer.invoke('memories:pin', id, pinned) as Promise<void>,
  deleteMemory: (id: string): Promise<void> =>
    ipcRenderer.invoke('memories:delete', id) as Promise<void>,

  // Settings
  getSettings: (): Promise<MaskedSettings> =>
    ipcRenderer.invoke('settings:get') as Promise<MaskedSettings>,
  setSettings: (patch: SettingsPatch): Promise<MaskedSettings> =>
    ipcRenderer.invoke('settings:set', patch) as Promise<MaskedSettings>,
  testConnections: (): Promise<TestConnectionsResult> =>
    ipcRenderer.invoke('settings:testConnections') as Promise<TestConnectionsResult>,
  createPineconeIndex: (): Promise<CreatePineconeIndexResult> =>
    ipcRenderer.invoke('settings:createPineconeIndex') as Promise<CreatePineconeIndexResult>,

  // Dev
  ping: () => ipcRenderer.invoke('ping') as Promise<string>,
}

contextBridge.exposeInMainWorld('api', api)

ipcRenderer.on('menu:navigate', (_event, path: string) => {
  window.dispatchEvent(new CustomEvent('menu:navigate', { detail: path }))
})

ipcRenderer.on('menu:toggle-sidebar', () => {
  window.dispatchEvent(new CustomEvent('menu:toggle-sidebar'))
})

ipcRenderer.on('theme:update', (_event, theme: 'dark' | 'light') => {
  window.dispatchEvent(new CustomEvent('theme:update', { detail: theme }))
})
