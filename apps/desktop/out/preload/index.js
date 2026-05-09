"use strict";
const electron = require("electron");
const notImplemented = () => Promise.reject(new Error("Not implemented in this phase"));
const api = {
  // Library / indexing
  pickFolder: () => electron.ipcRenderer.invoke("library:pickFolder"),
  addFolderIndex: (path) => electron.ipcRenderer.invoke("library:addFolderIndex", path),
  scanFolder: (indexId) => electron.ipcRenderer.invoke("library:scanFolder", indexId),
  dropFiles: (paths) => electron.ipcRenderer.invoke("library:dropFiles", paths),
  estimateFiles: (paths) => electron.ipcRenderer.invoke("library:estimateFiles", paths),
  getPathsForDroppedFiles: (files) => {
    if (!Array.isArray(files)) return [];
    const out = [];
    for (const f of files) {
      try {
        const p = electron.webUtils.getPathForFile(f);
        if (p.length > 0) out.push(p);
      } catch {
        const legacy = f.path;
        if (typeof legacy === "string" && legacy.length > 0) out.push(legacy);
      }
    }
    return out;
  },
  listDocuments: () => electron.ipcRenderer.invoke("library:listDocuments"),
  removeDocument: (documentId) => electron.ipcRenderer.invoke("library:removeDocument", documentId),
  reindexDocument: (documentId) => electron.ipcRenderer.invoke("library:reindexDocument", documentId),
  onJobEvent: (callback) => {
    const handler = (_, event) => callback(event);
    electron.ipcRenderer.on("job:event", handler);
    return () => electron.ipcRenderer.removeListener("job:event", handler);
  },
  // Collections
  listCollections: () => electron.ipcRenderer.invoke("library:listCollections"),
  createCollection: (name, color) => electron.ipcRenderer.invoke("library:createCollection", name, color),
  renameCollection: (id, name) => electron.ipcRenderer.invoke("library:renameCollection", id, name),
  deleteCollection: (id) => electron.ipcRenderer.invoke("library:deleteCollection", id),
  assignDocumentToCollection: (documentId, collectionId) => electron.ipcRenderer.invoke(
    "library:assignDocumentToCollection",
    documentId,
    collectionId
  ),
  removeDocumentFromCollection: (documentId, collectionId) => electron.ipcRenderer.invoke(
    "library:removeDocumentFromCollection",
    documentId,
    collectionId
  ),
  // Chat (Phase 3)
  listConversations: () => notImplemented(),
  createConversation: () => notImplemented(),
  listMessages: () => notImplemented(),
  sendMessage: () => notImplemented(),
  // Proposals (Phase 4)
  listProposals: () => notImplemented(),
  acceptProposal: () => notImplemented(),
  rejectProposal: () => notImplemented(),
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
  // Memories (Phase 4)
  listMemories: () => notImplemented(),
  updateMemory: () => notImplemented(),
  pinMemory: () => notImplemented(),
  deleteMemory: () => notImplemented(),
  // Settings
  getSettings: () => electron.ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => electron.ipcRenderer.invoke("settings:set", patch),
  testConnections: () => electron.ipcRenderer.invoke("settings:testConnections"),
  createPineconeIndex: () => electron.ipcRenderer.invoke("settings:createPineconeIndex"),
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
