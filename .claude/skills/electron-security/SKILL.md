---
name: "electron-security"
description: "Use when reviewing or writing Electron code for the Bestfriend app: IPC handler validation, contextBridge exposure patterns, CSP configuration, safeStorage usage, preload script security, renderer sandbox, nodeIntegration settings, and protection against common Electron vulnerabilities. Invoke whenever touching main process IPC, preload, or BrowserWindow configuration."
---

# Electron Security — Bestfriend Project

A security checklist and reference for the Bestfriend Electron app. This app handles user API keys, personal documents, and connects to OpenAI/Pinecone — security mistakes here have real consequences.

## Non-negotiable rules (break any of these = security bug)

### 1. Context isolation ON, nodeIntegration OFF everywhere
```typescript
// All BrowserWindows — no exceptions
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,      // MUST be true
    nodeIntegration: false,      // MUST be false
    sandbox: true,               // prefer true; required for quick-capture window
    preload: path.join(__dirname, 'preload.js'),
  }
})
```

### 2. contextBridge only — never expose ipcRenderer
```typescript
// CORRECT — preload/index.ts
contextBridge.exposeInMainWorld('api', {
  pickFolder: () => ipcRenderer.invoke('library:pickFolder'),
  sendMessage: (convId, text) => ipcRenderer.invoke('chat:sendMessage', convId, text),
})

// WRONG — exposes entire IPC bus to renderer
contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)
```

### 3. Validate every IPC argument in the handler
```typescript
// main/ipc/library.ts
ipcMain.handle('library:dropFiles', async (_, paths: unknown) => {
  // Validate before any filesystem operation
  if (!Array.isArray(paths) || !paths.every(p => typeof p === 'string')) {
    return { error: { code: 'INVALID_ARGS', message: 'paths must be string[]' } }
  }
  // Safe to proceed
  return jobRunner.dropFiles(paths)
})
```

### 4. API keys never in renderer — safeStorage only
```typescript
// Store in main process only
const encrypted = safeStorage.encryptString(apiKey)
db.prepare('UPDATE settings SET openai_key_enc=?').run(encrypted.toString('base64'))

// Retrieve in main process only — NEVER return raw key to renderer
const raw = safeStorage.decryptString(Buffer.from(b64, 'base64'))

// Return only masked version to renderer
return { openai_key: maskKey(raw) }  // e.g., "sk-...abc"
```

### 5. No raw file paths to renderer
```typescript
// WRONG — leaks FS layout to renderer
return { path: '/Users/alice/Documents/secret.pdf' }

// CORRECT — renderer gets ID + display name only
return { documentId: 'abc-123', displayName: 'secret.pdf', status: 'indexed' }
```

### 6. Content Security Policy — renderer
Set via `session.defaultSession.webRequest.onHeadersReceived` or meta tag:
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  connect-src 'none';  ← renderer never makes network calls directly
  font-src 'self';
```

### 7. No `remote` module, no `require` in renderer
These are disabled by default in modern Electron. Never re-enable them.

### 8. Secure IPC channel naming
Use `domain:action` format. Reject any channel names that don't match the allowlist in the preload.

## IPC Attack Surface Checklist

For every new IPC endpoint, answer:
- [ ] Is the channel name in the preload allowlist?
- [ ] Are all arguments validated (type + format) before use?
- [ ] Does the handler sanitize file paths before filesystem operations?
- [ ] Does the return value expose any sensitive data (keys, full paths)?
- [ ] Could the renderer trigger unbounded resource usage (large embeds, open-ended queries)?

## Quick-Capture Window — extra restrictions
The quick-capture window is always-on-top and accessible via global hotkey. It should:
- Have `sandbox: true` (stronger isolation)
- Only expose `quickCaptureText` and `quickCaptureVoice` IPC methods
- Auto-dismiss on blur (minimizes attack window)

## Threat Model Summary
| Threat | Mitigation |
|---|---|
| Renderer compromise → key exfil | Keys never leave main process; safeStorage |
| IPC injection via malicious input | Type validation on all handler args |
| Remote code execution via file | No nodeIntegration, contextIsolation |
| Malicious file path traversal | Main validates paths, renderer gets IDs only |
| XSS → privilege escalation | CSP; contextIsolation |
| Embedded web content RCE | No `<webview>` or embedded iframes used |

## References
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [contextBridge API](https://www.electronjs.org/docs/latest/api/context-bridge)
- [safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
