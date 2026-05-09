import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { WindowApi, JobEvent } from '@bestfriend/core'

const notImplemented = (): Promise<never> =>
  Promise.reject(new Error('Not implemented in this phase'))

const api: WindowApi = {
  // Library / indexing
  pickFolder: () => notImplemented(),
  addFolderIndex: () => notImplemented(),
  scanFolder: () => notImplemented(),
  dropFiles: () => notImplemented(),
  listDocuments: () => notImplemented(),
  removeDocument: () => notImplemented(),
  reindexDocument: () => notImplemented(),
  onJobEvent: (callback: (event: JobEvent) => void) => {
    const handler = (_: IpcRendererEvent, event: JobEvent) => callback(event)
    ipcRenderer.on('job:event', handler)
    return () => ipcRenderer.removeListener('job:event', handler)
  },

  // Collections
  listCollections: () => notImplemented(),
  createCollection: () => notImplemented(),
  renameCollection: () => notImplemented(),
  deleteCollection: () => notImplemented(),
  assignDocumentToCollection: () => notImplemented(),
  removeDocumentFromCollection: () => notImplemented(),

  // Chat
  listConversations: () => notImplemented(),
  createConversation: () => notImplemented(),
  listMessages: () => notImplemented(),
  sendMessage: () => notImplemented(),

  // Proposals
  listProposals: () => notImplemented(),
  acceptProposal: () => notImplemented(),
  rejectProposal: () => notImplemented(),

  // Reminders
  listReminders: () => notImplemented(),
  snoozeReminder: () => notImplemented(),
  dismissReminder: () => notImplemented(),

  // Feed
  listFeedItems: () => notImplemented(),
  markFeedRead: () => notImplemented(),

  // Inbox
  quickCaptureText: () => notImplemented(),
  quickCaptureVoice: () => notImplemented(),
  listInbox: () => notImplemented(),
  triageInboxItem: () => notImplemented(),
  openCaptureWindow: () => notImplemented(),

  // Memories
  listMemories: () => notImplemented(),
  updateMemory: () => notImplemented(),
  pinMemory: () => notImplemented(),
  deleteMemory: () => notImplemented(),

  // Settings
  getSettings: () => notImplemented(),
  setSettings: () => notImplemented(),
  testConnections: () => notImplemented(),

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
