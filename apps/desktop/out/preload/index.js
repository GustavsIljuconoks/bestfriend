"use strict";
const electron = require("electron");
const notImplemented = () => Promise.reject(new Error("Not implemented in this phase"));
const api = {
  // Library / indexing
  pickFolder: () => notImplemented(),
  addFolderIndex: () => notImplemented(),
  scanFolder: () => notImplemented(),
  dropFiles: () => notImplemented(),
  listDocuments: () => notImplemented(),
  removeDocument: () => notImplemented(),
  reindexDocument: () => notImplemented(),
  onJobEvent: (callback) => {
    const handler = (_, event) => callback(event);
    electron.ipcRenderer.on("job:event", handler);
    return () => electron.ipcRenderer.removeListener("job:event", handler);
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
  ping: () => electron.ipcRenderer.invoke("ping")
};
electron.contextBridge.exposeInMainWorld("api", api);
electron.ipcRenderer.on("menu:navigate", (_event, path) => {
  window.dispatchEvent(new CustomEvent("menu:navigate", { detail: path }));
});
electron.ipcRenderer.on("menu:toggle-sidebar", () => {
  window.dispatchEvent(new CustomEvent("menu:toggle-sidebar"));
});
electron.ipcRenderer.on("theme:update", (_event, theme) => {
  window.dispatchEvent(new CustomEvent("theme:update", { detail: theme }));
});
