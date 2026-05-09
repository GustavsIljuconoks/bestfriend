import type {
  AssistantTurn,
  Collection,
  ConversationSummary,
  CreatePineconeIndexResult,
  DocumentSummary,
  FeedItem,
  IndexingEstimate,
  InboxItem,
  JobEvent,
  MaskedSettings,
  Memory,
  Message,
  Proposal,
  Reminder,
  ReminderPayload,
  SettingsPatch,
  TestConnectionsResult,
  TriageAction,
} from './types.js'

export interface WindowApi {
  // Library / indexing
  pickFolder(): Promise<string | null>
  addFolderIndex(path: string): Promise<{ indexId: string }>
  scanFolder(indexId: string): Promise<{ jobId: string }>
  dropFiles(paths: string[]): Promise<{ jobId: string }>
  estimateFiles(paths: string[]): Promise<IndexingEstimate>
  /** Absolute paths for OS-backed files (drag/drop, file picker). Required on sandboxed renderers. */
  getPathsForDroppedFiles(files: File[]): string[]
  listDocuments(): Promise<DocumentSummary[]>
  removeDocument(documentId: string): Promise<void>
  reindexDocument(documentId: string): Promise<{ jobId: string }>
  onJobEvent(callback: (event: JobEvent) => void): () => void

  // Collections
  listCollections(): Promise<Collection[]>
  createCollection(name: string, color?: string): Promise<Collection>
  renameCollection(id: string, name: string): Promise<void>
  deleteCollection(id: string): Promise<void>
  assignDocumentToCollection(documentId: string, collectionId: string): Promise<void>
  removeDocumentFromCollection(documentId: string, collectionId: string): Promise<void>

  // Chat
  listConversations(): Promise<ConversationSummary[]>
  createConversation(scopeCollectionIds?: string[]): Promise<{ conversationId: string }>
  listMessages(conversationId: string): Promise<Message[]>
  sendMessage(conversationId: string, text: string): Promise<AssistantTurn>

  // Proposals
  listProposals(conversationId: string): Promise<Proposal[]>
  acceptProposal(proposalId: string, edited?: Partial<ReminderPayload>): Promise<void>
  rejectProposal(proposalId: string): Promise<void>

  // Reminders
  listReminders(): Promise<Reminder[]>
  snoozeReminder(reminderId: string, until: string): Promise<void>
  dismissReminder(reminderId: string): Promise<void>

  // Feed
  listFeedItems(): Promise<FeedItem[]>
  markFeedRead(feedItemId: string): Promise<void>

  // Inbox + quick-capture
  quickCaptureText(text: string): Promise<{ inboxItemId: string }>
  quickCaptureVoice(audioPath: string): Promise<{ inboxItemId: string }>
  listInbox(): Promise<InboxItem[]>
  triageInboxItem(id: string, action: TriageAction): Promise<void>
  openCaptureWindow(): Promise<void>

  // Memories
  listMemories(): Promise<Memory[]>
  updateMemory(id: string, content: string): Promise<void>
  pinMemory(id: string, pinned: boolean): Promise<void>
  deleteMemory(id: string): Promise<void>

  // Settings
  getSettings(): Promise<MaskedSettings>
  setSettings(patch: SettingsPatch): Promise<MaskedSettings>
  testConnections(): Promise<TestConnectionsResult>
  createPineconeIndex(): Promise<CreatePineconeIndexResult>

  // Dev / internal
  ping(): Promise<string>
}
